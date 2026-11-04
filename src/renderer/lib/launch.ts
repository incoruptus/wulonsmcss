/**
 * 从磁盘上的 .minecraft 解析出启动计划
 * ------------------------------------------------------------
 * 只读，不改任何文件。版本 JSON 的继承关系在这里展开，然后交给 launch-plan 拼命令。
 */

import { buildLaunchPlan, mergeVersions, type LaunchPlan, type VersionJson } from "./launch-plan";
import { tGlobal } from "../i18n/core";

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

/**
 * 这份版本 JSON 对应的「原版版本号」。
 * ------------------------------------------------------------
 * 官方启动器/HMCL 的写法是「原版 1.21.1」+「fabric-loader-… 继承 1.21.1」，
 * 但 PCL2 生成的是**合并版**目录：id 就叫 `26.1-Fabric 0.19.3`，没有 inheritsFrom。
 * 早期实现只认 inheritsFrom 或整个 id 相等，于是 PCL2 装的版本**永远匹配不上**——
 * 而 PCL2 恰好是国内最常用的启动器，等于「直接进游戏」对大多数玩家直接失效。
 * 这里退一步从 id 前缀里取版本号。
 */
export function mcVersionOf(version: VersionJson & { id?: string }): string | null {
  if (version.inheritsFrom) return version.inheritsFrom;
  const m = String(version.id ?? "").match(/^(\d+\.\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
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
    // 原版版本号：继承自谁，或者从合并版 id 的前缀里取（PCL2 风格）
    const original = mcVersionOf({ ...json, id: entry.id });
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
      warnings: [
        tGlobal("launch.warnNoClientVersion", "未找到 {mc} · {loader} 的客户端版本", {
          mc: opts.room.mc,
          loader: opts.room.loader,
        }),
      ],
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
