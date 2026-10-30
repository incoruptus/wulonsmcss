/**
 * 服务端 → 客户端：把「服务端有、客户端也该有」的 Mod 补过去
 * ------------------------------------------------------------
 * 和 client-mods.ts 的方向相反：那边是玩家把自己客户端的 Mod 回灌到服务端，
 * 这边是老玩家回归时，服务端加了新 Mod，把客户端补齐。
 *
 * 安全边界：
 *   - 只加不删、不覆盖；版本不一致的只提示，不动玩家的文件；
 *   - 纯服务端 Mod（environment=server）跳过，不然客户端会崩；
 *   - 每次写入都记一份 manifest，随时可以撤销这一次的复制。
 */

import type { ModMeta } from "./types";

/** 和 ModsTab 的 DiffRow 结构兼容，但不反过来依赖组件 */
export interface DiffLike {
  status: string;
  server?: ModMeta;
  client?: ModMeta;
}

export interface SyncPlan {
  /** 客户端缺的 Mod，可以安全复制 */
  add: ModMeta[];
  /** 版本不一致：不覆盖，提示用进服包或手动处理 */
  conflict: ModMeta[];
  /** 服务端专用，客户端不用装 */
  serverOnly: number;
  /** 云端清单没有文件路径，复制不了 */
  noFile: number;
}

export function planFromDiff(rows: DiffLike[]): SyncPlan {
  const plan: SyncPlan = { add: [], conflict: [], serverOnly: 0, noFile: 0 };
  for (const row of rows) {
    if (!row.server) continue;
    if (row.status === "version") {
      plan.conflict.push(row.server);
      continue;
    }
    if (row.status !== "server-only") continue;
    if (row.server.environment === "server") {
      plan.serverOnly += 1;
      continue;
    }
    if (!row.server.path) {
      plan.noFile += 1;
      continue;
    }
    plan.add.push(row.server);
  }
  return plan;
}

export interface SyncManifestEntry {
  at: number;
  /** 这次复制进来的文件（绝对路径），撤销时只删这些 */
  files: string[];
}

const MAX_MANIFESTS = 5;

const joinDir = (base: string, name: string) => `${base.replace(/[\\/]+$/, "")}\\${name}`;

export function manifestPath(mcDir: string): string {
  return joinDir(mcDir, "mcss-sync.json");
}

/** 读历史 manifest；坏了就当没有，不让同步功能把客户端卡死 */
export async function readManifests(mcDir: string): Promise<SyncManifestEntry[]> {
  try {
    const raw = await window.mcss.fs.read(manifestPath(mcDir));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is SyncManifestEntry => Boolean(x && typeof x === "object" && Array.isArray((x as SyncManifestEntry).files)));
  } catch {
    return [];
  }
}

export interface ApplyResult {
  copied: string[];
  failed: { file: string; error: string }[];
  skipped: number;
}

/** 复制缺的 Mod 到客户端。只加不覆盖，写失败不会破坏已有文件。 */
export async function applyServerToClient(mcDir: string, items: ModMeta[]): Promise<ApplyResult> {
  const modsDir = joinDir(mcDir, "mods");
  await window.mcss.fs.mkdir(modsDir).catch(() => {});
  const result: ApplyResult = { copied: [], failed: [], skipped: 0 };
  const files: string[] = [];

  for (const item of items) {
    if (!item.path) {
      result.failed.push({ file: item.file, error: "云端清单没有文件路径" });
      continue;
    }
    const dest = joinDir(modsDir, item.file);
    try {
      if (await window.mcss.fs.exists(dest)) {
        // 同名文件一律不动：玩家可能自己换过版本
        result.skipped += 1;
        continue;
      }
      await window.mcss.fs.copy(item.path, dest);
      result.copied.push(item.file);
      files.push(dest);
    } catch (e) {
      result.failed.push({ file: item.file, error: (e as Error)?.message || "复制失败" });
    }
  }

  if (files.length) {
    const history = await readManifests(mcDir);
    const next = [{ at: Date.now(), files }, ...history].slice(0, MAX_MANIFESTS);
    await window.mcss.fs.write(manifestPath(mcDir), JSON.stringify(next, null, 2)).catch(() => {});
  }

  return result;
}

/** 撤销最近一次「服务端 → 客户端」的复制；只删自己加过的文件 */
export async function undoServerToClient(mcDir: string): Promise<{ removed: number; failed: number }> {
  const history = await readManifests(mcDir);
  const last = history[0];
  if (!last) return { removed: 0, failed: 0 };

  let removed = 0;
  let failed = 0;
  for (const file of last.files) {
    try {
      if (await window.mcss.fs.exists(file)) {
        await window.mcss.fs.remove(file);
        removed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  await window.mcss.fs.write(manifestPath(mcDir), JSON.stringify(history.slice(1), null, 2)).catch(() => {});
  return { removed, failed };
}
