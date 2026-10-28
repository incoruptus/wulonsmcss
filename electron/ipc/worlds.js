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

module.exports = { scan, create, remove };
