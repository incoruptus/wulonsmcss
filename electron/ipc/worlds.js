/**
 * 多世界数据包：扫描 / 生成（调用 MWM CLI）/ 删除 / 重载
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function datapacksDir(serverDir) {
  return path.join(serverDir, "world", "datapacks");
}

function scan(serverDir) {
  const root = datapacksDir(serverDir);
  const packs = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return packs;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mwm-")) continue;
    const packDir = path.join(root, entry.name);
    const info = { name: entry.name, description: "", worlds: [] };
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(packDir, "pack.mcmeta"), "utf-8").replace(/^\uFEFF/, ""));
      info.description = meta?.pack?.description || "";
    } catch (e) {}
    const dataDir = path.join(packDir, "data");
    try {
      for (const ns of fs.readdirSync(dataDir)) {
        const dimDir = path.join(dataDir, ns, "dimension");
        if (!fs.existsSync(dimDir)) continue;
        for (const file of fs.readdirSync(dimDir)) {
          if (!file.endsWith(".json")) continue;
          try {
            const dim = JSON.parse(fs.readFileSync(path.join(dimDir, file), "utf-8"));
            info.worlds.push({
              id: `${ns}:${file.replace(/\.json$/, "")}`,
              type: dim.type || "",
              generator: dim.generator?.type || ""
            });
          } catch (e) {}
        }
      }
    } catch (e) {}
    packs.push(info);
  }
  return packs;
}

function create(serverDir, worldConfig, mwmDir) {
  const cli = path.join(mwmDir, "src", "cli.js");
  if (!fs.existsSync(cli)) return { success: false, error: `MWM 生成器缺失：${cli}` };

  const name = String(worldConfig?.name || "");
  if (!/^[a-z0-9_-]{1,48}$/i.test(name)) {
    return { success: false, error: "世界名称只能包含字母、数字、下划线和连字符" };
  }
  const namespace = worldConfig?.namespace || "wulons";
  if (!/^[a-z0-9_.-]{1,48}$/i.test(namespace)) return { success: false, error: "命名空间不合法" };

  const os = require("os");
  const tmpConfig = path.join(os.tmpdir(), `mwm-tmp-${Date.now()}.json`);
  const tmpOutput = path.join(os.tmpdir(), `mwm-out-${Date.now()}`);
  fs.writeFileSync(tmpConfig, JSON.stringify({ namespace, worlds: [{ ...worldConfig, name }] }, null, 2));

  try {
    execFileSync(process.execPath, [cli, tmpConfig, tmpOutput], {
      timeout: 30000,
      cwd: mwmDir,
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    const packName = `mwm-${namespace}-${name}`;
    const src = path.join(tmpOutput, packName);
    const dest = path.join(datapacksDir(serverDir), packName);
    if (!fs.existsSync(src)) return { success: false, error: "MWM 生成器没有产出数据包" };
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    return { success: true };
  } catch (e) {
    const detail = e.stderr ? e.stderr.toString().trim() : "";
    return { success: false, error: detail ? `${e.message}\n${detail}` : e.message };
  } finally {
    try {
      fs.rmSync(tmpConfig, { force: true });
    } catch (e) {}
    try {
      fs.rmSync(tmpOutput, { recursive: true, force: true });
    } catch (e) {}
  }
}

function remove(serverDir, packName) {
  if (!/^mwm-[\w.-]+$/.test(packName)) return { success: false, error: "数据包名称不合法" };
  try {
    fs.rmSync(path.join(datapacksDir(serverDir), packName), { recursive: true, force: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 修复旧版本生成的数据包：
 * - 26.1 的 dimension_type 换了 schema（attributes / has_ender_dragon_fight），
 *   旧包会让「注册表加载失败」直接导致服务器起不来
 * - 同时把 pack_format 升到 101
 * 返回修了哪些文件，方便 UI 展示。
 */
async function repair(serverDir, mwmDir) {
  const templatePath = path.join(mwmDir || path.join(__dirname, "..", "..", "wulons-mcss-mwm"), "src", "templates", "dimension_types.js");
  let mod;
  let gen;
  try {
    const { pathToFileURL } = require("url");
    const base = mwmDir || path.join(__dirname, "..", "..", "wulons-mcss-mwm");
    mod = await import(pathToFileURL(path.join(base, "src", "templates", "dimension_types.js")).href);
    gen = await import(pathToFileURL(path.join(base, "src", "generate.js")).href);
  } catch (e) {
    return { success: false, error: `模板加载失败：${e.message}` };
  }

  const { TYPE_MAP, inferTypeFromDimension } = mod;
  const root = datapacksDir(serverDir);
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return { success: false, error: "没有找到 world/datapacks" };
  }

  const fixed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mwm-")) continue;
    const packDir = path.join(root, entry.name);

    // pack.mcmeta
    const metaPath = path.join(packDir, "pack.mcmeta");
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8").replace(/^\uFEFF/, ""));
      meta.pack = { ...meta.pack, pack_format: 101, min_format: [101, 1], max_format: 101 };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      fixed.push(`${entry.name}/pack.mcmeta`);
    } catch (e) {}

    // 逐个维度重写 dimension_type
    const dataDir = path.join(packDir, "data");
    let namespaces = [];
    try {
      namespaces = fs.readdirSync(dataDir);
    } catch (e) {
      continue;
    }
    for (const ns of namespaces) {
      const dimDir = path.join(dataDir, ns, "dimension");
      if (!fs.existsSync(dimDir)) continue;
      for (const file of fs.readdirSync(dimDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dimDir, file), "utf-8").replace(/^\uFEFF/, ""));
          const dim = gen.normalizeDimension(raw);
          if (JSON.stringify(dim) !== JSON.stringify(raw)) {
            fs.writeFileSync(path.join(dimDir, file), JSON.stringify(dim, null, 2));
            fixed.push(`${entry.name}/${ns}/${file} → biome_source 改为显式数组`);
          }
          const kind = inferTypeFromDimension(dim);
          const template = TYPE_MAP[kind] ?? TYPE_MAP.overworld;
          const typePath = path.join(dataDir, ns, "dimension_type", file);
          fs.mkdirSync(path.dirname(typePath), { recursive: true });
          fs.writeFileSync(typePath, JSON.stringify(template.type, null, 2));
          fixed.push(`${entry.name}/${ns}/${file} → ${kind}`);
        } catch (e) {}
      }
    }
  }

  return { success: true, fixed };
}

module.exports = { scan, create, remove, repair };
