/**
 * Gist 自动同步引擎
 * ------------------------------------------------------------
 * 流程：读配置 → 扫各实例 Mod 清单 → 拉远端密文 → 配对码解密 → 合并（墓碑 + LWW）
 *      → 落库 → 推送本端快照（内容没变则跳过，省 Gist 修订）
 * 并发调用共享同一轮（单飞）。
 */

import { create } from "zustand";
import type { AppConfig } from "../types";
import { isPairCodeWellFormed } from "./crypto";
import { gistFind, gistPull, gistPush, type GistCandidate } from "./gist";
import { mergeSyncState, toSyncInstance, type MergeResult } from "./merge";
import { buildEnvelope, parseEnvelope, quickHash, serializeEnvelope, stableJson } from "./pack";
import {
  SYNC_FORMAT,
  SYNC_FORMAT_VERSION,
  type SyncConfig,
  type SyncMod,
  type SyncPayloadV1,
  type SyncTombstone,
} from "./types";

export type SyncPhase = "off" | "idle" | "syncing" | "ok" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  message?: string;
  at: number | null;
}

export const useSync = create<{ status: SyncStatus }>(() => ({
  status: { phase: "off", at: null },
}));

function setStatus(status: SyncStatus) {
  useSync.setState({ status });
}

export function markIdle() {
  if (useSync.getState().status.phase !== "syncing") setStatus({ phase: "idle", at: useSync.getState().status.at });
}

export function markOff() {
  if (useSync.getState().status.phase !== "syncing") setStatus({ phase: "off", at: useSync.getState().status.at });
}

export interface SyncDeps {
  getConfig: () => AppConfig;
  /** 扫描某个实例服务端的 mods 目录 */
  scanMods: (dir: string) => Promise<SyncMod[]>;
  /** 把合并结果写回配置 */
  applyResult: (result: MergeResult, remote: SyncPayloadV1) => Promise<void>;
  saveSync: (patch: Partial<SyncConfig>) => Promise<void>;
}

export interface SyncOutcome {
  pulled: boolean;
  pushed: boolean;
  applied: MergeResult["applied"] | null;
  skipped?: boolean;
}

/** 失败退避：1m → 5m → 30m → 2h */
export function backoffDelayMs(streak: number): number {
  const steps = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000];
  return steps[Math.min(Math.max(streak - 1, 0), steps.length - 1)];
}

let inFlight: Promise<SyncOutcome> | null = null;

export function runSync(deps: SyncDeps, opts: { manual?: boolean } = {}): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = runOnce(deps, opts.manual === true).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function buildPayload(cfg: AppConfig, deps: SyncDeps): Promise<SyncPayloadV1> {
  const sync = cfg.sync!;
  const instances = [];
  for (const inst of cfg.instances) {
    // 本机没有目录（从别的设备同步来的实例）时，沿用它上次的清单，别把云端清单推成空
    const mods = inst.dir ? await deps.scanMods(inst.dir).catch(() => []) : (cfg.remoteCatalogs?.[inst.id]?.mods ?? []);
    instances.push(toSyncInstance(inst, mods));
  }
  return {
    format: SYNC_FORMAT,
    version: SYNC_FORMAT_VERSION,
    deviceId: sync.deviceId,
    createdAt: Date.now(),
    instances,
    tombstones: sync.tombstones ?? [],
    settings: {
      consoleViewMode: cfg.consoleViewMode,
      maxLogLines: cfg.maxLogLines,
      animationsEnabled: cfg.animationsEnabled,
    },
    quickActions: cfg.quickActions,
    frpProfiles: cfg.frpProfiles,
  };
}

async function runOnce(deps: SyncDeps, manual: boolean): Promise<SyncOutcome> {
  const cfg = deps.getConfig();
  const sync = cfg.sync;
  if (!sync?.token) throw new Error("尚未填写 GitHub Token");
  if (!sync.pairCode || !isPairCodeWellFormed(sync.pairCode)) {
    throw new Error("配对码尚未就绪，请先生成，或粘贴另一台设备的配对码");
  }
  if (!manual && sync.backoffUntil && Date.now() < sync.backoffUntil) {
    return { pulled: false, pushed: false, applied: null, skipped: true };
  }

  setStatus({ phase: "syncing", at: Date.now(), message: "正在同步…" });
  try {
    let pulled = false;
    let applied: MergeResult["applied"] | null = null;
    let remoteFiles: string[] | undefined;
    let remote: Awaited<ReturnType<typeof gistPull>> | null = null;
    let parsed: SyncPayloadV1 | null = null;

    // 1) 拉取（自家 Gist 被删也不致命，走发现逻辑）
    if (sync.gistId) {
      try {
        remote = await gistPull(sync);
      } catch (e) {
        if (!/找不到同步仓库/.test((e as Error).message)) throw e;
      }
    }
    if (remote) parsed = await parseEnvelope(remote.text, sync.pairCode);

    // 2) 中转站发现 / 认领：同配对共用同一个 Gist
    const candidates = await gistFind(sync).catch((): GistCandidate[] => []);
    const adopt = async (id: string): Promise<boolean> => {
      try {
        const r = await gistPull({ ...sync, gistId: id });
        if (!r) return false;
        const p = await parseEnvelope(r.text, sync.pairCode); // 解不开 = 不是本配对的站
        remote = r;
        parsed = p;
        await deps.saveSync({ gistId: id });
        return true;
      } catch {
        return false;
      }
    };
    if (!remote) {
      for (const cand of candidates) {
        if (cand.id === sync.gistId) continue;
        if (await adopt(cand.id)) break;
      }
    } else {
      const ownTagged = candidates.find((c) => c.id === sync.gistId)?.exact ?? false;
      const exactBetter = candidates.find((c) => c.exact && c.id !== sync.gistId && c.updatedAt > remote!.revision);
      if (exactBetter) await adopt(exactBetter.id);
      else if (!ownTagged) {
        for (const cand of candidates) {
          if (cand.id === sync.gistId) continue;
          if (await adopt(cand.id)) break;
        }
      }
    }

    // 3) 合并
    let mergeInstances = cfg.instances;
    if (remote && parsed && parsed.deviceId !== sync.deviceId) {
      remoteFiles = remote.fileNames;
      const result = mergeSyncState({
        localInstances: cfg.instances,
        localQuickActions: cfg.quickActions,
        localFrpProfiles: cfg.frpProfiles,
        remote: parsed,
        tombstones: sync.tombstones ?? [],
        lastSyncAt: sync.lastSyncAt ?? null,
        now: Date.now(),
      });
      await deps.applyResult(result, parsed);
      mergeInstances = result.instances;
      pulled = true;
      applied = result.applied;
    }

    // 4) 推送（内容与上轮相同则跳过）
    const fresh = deps.getConfig();
    const current = fresh.sync ?? sync;
    const payload = await buildPayload({ ...fresh, instances: mergeInstances, sync: current }, deps);
    const payloadHash = quickHash(payload);
    let pushed = false;
    let gistId = current.gistId;

    if (current.lastPushHash !== payloadHash || !current.gistId) {
      const envelope = await buildEnvelope(payload, { deviceId: current.deviceId, pairCode: current.pairCode });
      const res = await gistPush(current, serializeEnvelope(envelope), { existingFiles: remoteFiles });
      gistId = res.gistId;
      pushed = true;
    }

    await deps.saveSync({
      gistId,
      lastPushHash: payloadHash,
      lastSyncAt: Date.now(),
      lastError: null,
      failStreak: 0,
      backoffUntil: null,
      excludeGistIds: [],
      base: {
        instances: Object.fromEntries(payload.instances.map((i) => [i.id, i.updatedAt])),
        remoteHash: remote ? quickHash(stableJson(parsed)) : null,
      },
    });

    const bits: string[] = [];
    if (applied) bits.push(`新增 ${applied.added} · 更新 ${applied.updated} · 删除 ${applied.deleted}`);
    setStatus({
      phase: "ok",
      at: Date.now(),
      message: bits.length ? `同步完成 · ${bits.join(" · ")}` : pushed || pulled ? "同步完成" : "已经是最新",
    });
    return { pulled, pushed, applied };
  } catch (e) {
    const message = (e as Error).message || "同步失败";
    const streak = (sync.failStreak ?? 0) + 1;
    try {
      await deps.saveSync({ lastError: message, failStreak: streak, backoffUntil: Date.now() + backoffDelayMs(streak) });
    } catch {
      /* 记录失败不阻断报错 */
    }
    setStatus({ phase: "error", at: Date.now(), message });
    throw e;
  }
}

/** 由配置驱动的同步依赖（UI 层只需调用 runSync(buildDeps())） */
export function buildDeps(store: {
  getConfig: () => AppConfig;
  patch: (p: Partial<AppConfig>) => Promise<AppConfig>;
}): SyncDeps {
  return {
    getConfig: store.getConfig,
    scanMods: async (dir) => {
      const list = await window.mcss.mods.scan(`${dir}\\mods`);
      return list.map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        environment: m.environment,
        file: m.file,
      }));
    },
    applyResult: async (result, remotePayload) => {
      const cfg = store.getConfig();
      const catalogs: NonNullable<AppConfig["remoteCatalogs"]> = { ...(cfg.remoteCatalogs ?? {}) };
      for (const inst of remotePayload.instances) {
        catalogs[inst.id] = {
          instanceId: inst.id,
          updatedAt: inst.updatedAt,
          fetchedAt: Date.now(),
          deviceId: remotePayload.deviceId,
          mods: inst.mods,
        };
      }
      await store.patch({
        instances: result.instances,
        quickActions: result.quickActions,
        frpProfiles: result.frpProfiles,
        remoteCatalogs: catalogs,
        sync: { ...(cfg.sync as SyncConfig), tombstones: result.tombstones },
      });
    },
    saveSync: async (patch) => {
      const cfg = store.getConfig();
      await store.patch({ sync: { ...(cfg.sync as SyncConfig), ...patch } });
    },
  };
}

export type { SyncTombstone };
