/**
 * 从磁盘上的 .minecraft 解析出启动计划
 * ------------------------------------------------------------
 * 只读，不改任何文件。版本 JSON 的继承关系在这里展开，然后交给 launch-plan 拼命令。
 */

import { buildLaunchPlan, mergeVersions, type LaunchPlan, type VersionJson } from "./launch-plan";

const join = (base: string, ...parts: string[]) => [base, ...parts].join("\\").replace(/\\+/g, "\\");

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse((await window.mcss.fs.read(path)).replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

async function listVersions(mcDir: string): Promise<{ id: string; dir: string }[]> {
  try {
    const entries = await window.mcss.fs.list(join(mcDir, "versions"));
    return entries.filter((e) => e.isDir).map((e) => ({ id: e.name, dir: e.path }));
  } catch {
    return [];
  }
}

/** 递归展开 inheritsFrom，得到一份完整版本 JSON */
export async function resolveVersionJson(mcDir: string, id: string, depth = 0): Promise<VersionJson | null> {
  if (depth > 3) return null;
  const dir = join(mcDir, "versions", id);
  const json = await readJson<VersionJson>(join(dir, `${id}.json`));
  if (!json) return null;
  if (!json.inheritsFrom) return json;

  const parent = await resolveVersionJson(mcDir, json.inheritsFrom, depth + 1);
  return parent ? mergeVersions(parent, json) : json;
}

function hasLoader(version: VersionJson, loader: string): boolean {
  if (loader === "vanilla") return true;
  return (version.libraries ?? []).some((lib) => lib.name.includes(`:${loader}-loader:`) || lib.name.includes(`:${loader}:`));
}

export interface ResolvedVersion {
  id: string;
  dir: string;
  json: VersionJson;
}

/** 在 .minecraft 里找房间要的那个版本（mc 版本 + 加载器都对得上） */
export async function findMatchingVersion(
  mcDir: string,
  room: { mc: string; loader: string },
): Promise<ResolvedVersion | null> {
  for (const entry of await listVersions(mcDir)) {
    const json = await resolveVersionJson(mcDir, entry.id);
    if (!json) continue;
    // 原版版本号：继承自谁，或者它自己
    const mcVersion = json.inheritsFrom ? undefined : json.id;
    const original = (await readJson<VersionJson>(join(mcDir, "versions", entry.id, `${entry.id}.json`)))?.inheritsFrom ?? mcVersion;
    if (original !== room.mc) continue;
    if (!hasLoader(json, room.loader)) continue;
    return { id: entry.id, dir: entry.dir, json };
  }
  return null;
}

export interface DiskLaunchOptions {
  mcDir: string;
  room: { mc: string; loader: string; addr: string };
  username: string;
  javaPath: string;
  memoryGb: { min: number; max: number };
  platform?: "windows" | "macos" | "linux";
}

export type DiskPlan = LaunchPlan & { versionId: string | null };

/**
 * 生成「直接进游戏」的计划。
 * 找不到匹配版本时返回空命令 + 明确的 warnings，由 UI 决定退回进服包。
 */
export async function planFromDisk(opts: DiskLaunchOptions): Promise<DiskPlan> {
  const resolved = await findMatchingVersion(opts.mcDir, opts.room);
  if (!resolved) {
    return {
      command: [],
      missing: [],
      warnings: [`没找到 ${opts.room.mc} · ${opts.room.loader} 的客户端版本`],
      versionId: null,
    };
  }

  const [host, port] = opts.room.addr.split(":");
  const plan = await buildLaunchPlan({
    version: resolved.json,
    gameDir: opts.mcDir,
    versionDir: resolved.dir,
    username: opts.username,
    javaPath: opts.javaPath,
    memoryGb: opts.memoryGb,
    platform: opts.platform ?? "windows",
    exists: (p) => window.mcss.fs.exists(p).catch(() => false),
    nativesDir: join(opts.mcDir, "versions", resolved.id, "natives"),
    server: { host, port: Number(port) || 25565 },
  });

  return { ...plan, versionId: resolved.id };
}
