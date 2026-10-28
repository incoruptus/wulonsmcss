/**
 * 多世界管理（渲染层实现）
 * ------------------------------------------------------------
 * 生成逻辑来自 `wulons-mcss-mwm`（与 CLI 同一份代码，见 mwm.test.ts 的逐字节比对），
 * 这里只负责用 IPC 的 fs 通道读写文件 —— 于是桌面版和网页版走完全相同的路径。
 */

import { buildWorldPack, normalizeDimension, templateFor, type WorldConfig } from "./mwm";

export interface WorldSummary {
  id: string;
  type: string;
  generator: string;
}

export interface WorldPack {
  name: string;
  description: string;
  worlds: WorldSummary[];
}

const splitPath = (p: string) => p.replace(/\//g, "\\");
const join = (...parts: string[]) => parts.join("\\").replace(/\\\\+/g, "\\");

export function datapacksDir(serverDir: string): string {
  return join(serverDir, "world", "datapacks");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await window.mcss.fs.read(path);
    return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

async function listEntries(dir: string): Promise<{ name: string; path: string; isDir: boolean }[]> {
  try {
    return await window.mcss.fs.list(dir);
  } catch {
    return [];
  }
}

async function listDirs(dir: string): Promise<{ name: string; path: string }[]> {
  return (await listEntries(dir)).filter((e) => e.isDir).map((e) => ({ name: e.name, path: e.path }));
}

async function listJsonFiles(dir: string): Promise<{ name: string; path: string }[]> {
  return (await listEntries(dir))
    .filter((e) => !e.isDir && e.name.endsWith(".json"))
    .map((e) => ({ name: e.name.replace(/\.json$/, ""), path: e.path }));
}

/** 扫描 world/datapacks 下所有 mwm-* 数据包 */
export async function scan(serverDir: string): Promise<WorldPack[]> {
  const packs: WorldPack[] = [];
  for (const entry of await listDirs(datapacksDir(serverDir))) {
    if (!entry.name.startsWith("mwm-")) continue;
    const meta = await readJson<{ pack?: { description?: string | { text?: string } } }>(join(entry.path, "pack.mcmeta"));
    let description = "";
    const raw = meta?.pack?.description;
    description = typeof raw === "string" ? raw : raw?.text ?? "";

    const worlds: WorldSummary[] = [];
    for (const ns of await listDirs(join(entry.path, "data"))) {
      for (const dim of await listJsonFiles(join(ns.path, "dimension"))) {
        const json = await readJson<{ type?: string; generator?: { type?: string } }>(dim.path);
        if (!json) continue;
        worlds.push({
          id: `${ns.name}:${dim.name}`,
          type: json.type ?? "",
          generator: json.generator?.type ?? "",
        });
      }
    }
    packs.push({ name: entry.name, description, worlds });
  }
  return packs;
}

/** 生成并写入一个世界的数据包（同名会先清空） */
export async function create(
  serverDir: string,
  config: WorldConfig & { namespace?: string },
): Promise<{ success: boolean; error?: string; packName?: string }> {
  const name = String(config.name ?? "");
  if (!/^[a-z0-9_-]{1,48}$/i.test(name)) {
    return { success: false, error: "世界名只能包含字母、数字、下划线和连字符" };
  }
  const namespace = config.namespace || "wulons";
  if (!/^[a-z0-9_.-]{1,48}$/i.test(namespace)) {
    return { success: false, error: "命名空间不合法" };
  }

  let pack;
  try {
    pack = buildWorldPack({ ...config, name }, namespace);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const root = join(datapacksDir(serverDir), pack.packName);
  try {
    await window.mcss.fs.remove(root);
    for (const file of pack.files) {
      await window.mcss.fs.write(join(root, splitPath(file.path)), file.content);
    }
    return { success: true, packName: pack.packName };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function remove(serverDir: string, packName: string): Promise<{ success: boolean; error?: string }> {
  if (!/^mwm-[\w.-]+$/.test(packName)) return { success: false, error: "数据包名称不合法" };
  try {
    await window.mcss.fs.remove(join(datapacksDir(serverDir), packName));
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * 修复旧数据包：pack_format 升到 101，dimension 的 biome_source 换成显式数组，
 * dimension_type 按推断出的类型重写（26.1 少了 has_ender_dragon_fight 会直接起不来）。
 */
export async function repair(serverDir: string): Promise<{ success: boolean; error?: string; fixed?: string[] }> {
  const root = datapacksDir(serverDir);
  const packs = await listDirs(root);
  if (!packs.length) return { success: false, error: "没有找到 world/datapacks" };

  const fixed: string[] = [];
  for (const pack of packs) {
    if (!pack.name.startsWith("mwm-")) continue;

    const metaPath = join(pack.path, "pack.mcmeta");
    const meta = await readJson<{ pack?: Record<string, unknown> }>(metaPath);
    if (meta?.pack) {
      meta.pack = { ...meta.pack, pack_format: 101, min_format: [101, 1], max_format: 101 };
      await window.mcss.fs.write(metaPath, JSON.stringify(meta, null, 2));
      fixed.push(`${pack.name}/pack.mcmeta`);
    }

    for (const ns of await listDirs(join(pack.path, "data"))) {
      for (const dim of await listJsonFiles(join(ns.path, "dimension"))) {
        const file = dim.path;
        const raw = await readJson<Record<string, unknown>>(file);
        if (!raw) continue;

        const normalized = normalizeDimension(raw);
        if (JSON.stringify(normalized) !== JSON.stringify(raw)) {
          await window.mcss.fs.write(file, JSON.stringify(normalized, null, 2));
          fixed.push(`${pack.name}/${ns.name}/${dim.name}.json → biome_source 改为显式数组`);
        }

        const { kind, type } = templateFor(normalized);
        await window.mcss.fs.write(join(ns.path, "dimension_type", `${dim.name}.json`), JSON.stringify(type, null, 2));
        fixed.push(`${pack.name}/${ns.name}/${dim.name}.json → ${kind}`);
      }
    }
  }

  return { success: true, fixed };
}

export async function reload(): Promise<{ success: boolean }> {
  // 数据包是文件级的，/reload 交给服务器命令；这里保留接口以对齐桌面版
  return { success: true };
}
