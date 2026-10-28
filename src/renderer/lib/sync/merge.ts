/**
 * 合并层（纯函数）
 * ------------------------------------------------------------
 * 同步只搬运「可跨设备」的东西：实例元数据 + 服务端 Mod 清单 + 快捷操作 + FRP 配置。
 * 绝对路径（dir / javaPath）永远是本机的，不参与冲突裁决，也不会被远端覆盖。
 *
 * 冲突裁决：按 updatedAt 取新（Last-Write-Wins），删除用墓碑（tombstone）压住，
 * 避免「这台删了、那台又推回来」。
 */

import type { FrpProfile, Instance, QuickAction } from "../types";
import type { SyncInstance, SyncPayloadV1, SyncTombstone } from "./types";

export const TOMBSTONE_TTL = 180 * 24 * 3600 * 1000;

export interface MergeInput {
  localInstances: Instance[];
  localQuickActions: QuickAction[];
  localFrpProfiles: FrpProfile[];
  remote: SyncPayloadV1;
  tombstones: SyncTombstone[];
  lastSyncAt: number | null;
  now: number;
}

export interface MergeApplied {
  added: number;
  updated: number;
  deleted: number;
}

export interface MergeResult {
  instances: Instance[];
  quickActions: QuickAction[];
  frpProfiles: FrpProfile[];
  tombstones: SyncTombstone[];
  applied: MergeApplied;
}

export function toSyncInstance(inst: Instance, mods: SyncInstance["mods"]): SyncInstance {
  return {
    id: inst.id,
    name: inst.name,
    mcVersion: inst.mcVersion,
    loader: inst.loader,
    loaderVersion: inst.loaderVersion,
    port: inst.port,
    memoryMin: inst.memoryMin,
    memoryMax: inst.memoryMax,
    updatedAt: inst.updatedAt,
    mods,
  };
}

function newer<T extends { updatedAt: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function mergeSyncState(input: MergeInput): MergeResult {
  const { localInstances, localQuickActions, localFrpProfiles, remote, lastSyncAt, now } = input;

  // 1) 墓碑合并（同一 id 取更晚的删除时间）
  const tombMap = new Map<string, SyncTombstone>();
  for (const t of [...input.tombstones, ...remote.tombstones]) {
    const prev = tombMap.get(t.id);
    if (!prev || t.deletedAt > prev.deletedAt) tombMap.set(t.id, t);
  }
  // 超过 TTL 的墓碑可以丢掉了
  const tombstones = [...tombMap.values()].filter((t) => now - t.deletedAt < TOMBSTONE_TTL);

  const remoteById = new Map(remote.instances.map((i) => [i.id, i]));
  const localById = new Map(localInstances.map((i) => [i.id, i]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  const instances: Instance[] = [];
  let added = 0;
  let updated = 0;
  let deleted = 0;

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    const tomb = tombMap.get(id);

    // 墓碑比两边都新 → 真的删掉
    if (tomb && tomb.deletedAt >= Math.max(l?.updatedAt ?? 0, r?.updatedAt ?? 0)) {
      if (l) deleted += 1;
      continue;
    }

    if (!r) {
      if (l) instances.push(l);
      continue;
    }

    const base = l ? { ...r, updatedAt: l.updatedAt } : null;
    const winnerSync = newer(base ?? undefined, r)!;

    if (!l) {
      // 远端独有：导入为「待绑定目录」的实例
      instances.push({
        id: r.id,
        name: r.name,
        // 目录/Java 是本机专属，留空等用户绑定
        dir: "",
        mcVersion: r.mcVersion,
        loader: r.loader,
        loaderVersion: r.loaderVersion,
        javaPath: "",
        memoryMin: r.memoryMin,
        memoryMax: r.memoryMax,
        jvmArgs: "",
        port: r.port,
        createdAt: r.updatedAt,
        updatedAt: r.updatedAt,
        importedFrom: remote.deviceId
      });
      added += 1;
      continue;
    }

    // 两边都有：元数据取新，本机路径永远保留本机的
    if (r.updatedAt > l.updatedAt) {
      instances.push({
        ...l,
        name: r.name,
        mcVersion: r.mcVersion,
        loader: r.loader,
        loaderVersion: r.loaderVersion,
        port: r.port,
        memoryMin: r.memoryMin,
        memoryMax: r.memoryMax,
        updatedAt: r.updatedAt
      });
      updated += 1;
    } else {
      instances.push(l);
    }
  }

  // 2) 快捷操作 / FRP：整组 LWW（远端比上次同步新就采用远端）
  const remoteIsFresh = lastSyncAt === null ? false : remote.createdAt > lastSyncAt;
  const quickActions = remoteIsFresh ? remote.quickActions : localQuickActions;
  const frpProfiles = remoteIsFresh ? remote.frpProfiles : localFrpProfiles;

  return { instances, quickActions, frpProfiles, tombstones, applied: { added, updated, deleted } };
}
