import { describe, expect, it } from "vitest";
import { generatePairCode, isPairCodeWellFormed, normalizePairCode, pairIdOf, encryptPayload, decryptPayload } from "./crypto";
import { buildEnvelope, parseEnvelope, quickHash, stableJson } from "./pack";
import { mergeSyncState } from "./merge";
import { SYNC_FORMAT, SYNC_FORMAT_VERSION, type SyncPayloadV1, type SyncTombstone } from "./types";
import type { Instance } from "../types";

const PAIR = "ABCD-EFGH-JKLM-NPQR-STUV";

function payload(over: Partial<SyncPayloadV1> = {}): SyncPayloadV1 {
  return {
    format: SYNC_FORMAT,
    version: SYNC_FORMAT_VERSION,
    deviceId: "dev-a",
    createdAt: 1000,
    instances: [],
    tombstones: [],
    settings: { consoleViewMode: "code", maxLogLines: 1000, animationsEnabled: true },
    quickActions: [],
    frpProfiles: [],
    ...over,
  };
}

function inst(over: Partial<Instance> = {}): Instance {
  return {
    id: "i1",
    name: "主服",
    dir: "D:\\srv",
    mcVersion: "26.1",
    loader: "fabric",
    javaPath: "C:\\jdk\\bin\\java.exe",
    memoryMin: 2,
    memoryMax: 8,
    jvmArgs: "",
    port: 25565,
    createdAt: 1,
    updatedAt: 10,
    ...over,
  };
}

describe("配对码", () => {
  it("生成的码格式合法且可归一化", () => {
    const code = generatePairCode();
    expect(isPairCodeWellFormed(code)).toBe(true);
    expect(normalizePairCode(code.replace(/-/g, "").toLowerCase())).toBe(code);
  });

  it("配对标识只由码决定", () => {
    expect(pairIdOf(PAIR)).toBe(pairIdOf(PAIR.toLowerCase()));
    expect(pairIdOf(PAIR)).toMatch(/^pair-[0-9a-f]{8}$/);
  });
});

describe("加密载荷", () => {
  it("同一配对码可解，错码解不开", async () => {
    const payloadJson = JSON.stringify({ hello: "世界" });
    const enc = await encryptPayload(payloadJson, PAIR);
    await expect(decryptPayload(enc.payloadB64, PAIR, enc)).resolves.toBe(payloadJson);
    await expect(
      decryptPayload(enc.payloadB64, "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", enc),
    ).rejects.toThrow(/配对码不对/);
  });
});

describe("同步信封", () => {
  it("构建 → 解析能还原载荷", async () => {
    const p = payload({ instances: [] });
    const env = await buildEnvelope(p, { deviceId: "dev-a", pairCode: PAIR });
    const parsed = await parseEnvelope(JSON.stringify(env), PAIR);
    expect(parsed.deviceId).toBe("dev-a");
    expect(parsed.format).toBe(SYNC_FORMAT);
  });

  it("被篡改的载荷会被校验和挡住", async () => {
    const env = await buildEnvelope(payload(), { deviceId: "dev-a", pairCode: PAIR });
    const broken = { ...env, payload: env.payload.slice(0, -4) + "AAAA" };
    await expect(parseEnvelope(JSON.stringify(broken), PAIR)).rejects.toThrow(/校验和/);
  });

  it("stableJson 与键顺序无关", () => {
    expect(stableJson({ b: 1, a: 2 })).toBe(stableJson({ a: 2, b: 1 }));
    expect(quickHash({ a: 1 })).toHaveLength(32);
  });
});

describe("合并", () => {
  const base = {
    localQuickActions: [],
    localFrpProfiles: [],
    lastSyncAt: null as number | null,
    now: 1_000_000,
  };

  it("远端独有的实例会被导入，但目录留空", () => {
    const remote = payload({
      deviceId: "dev-b",
      instances: [
        { id: "i2", name: "朋友的服", mcVersion: "26.1", loader: "fabric", port: 25566, memoryMin: 2, memoryMax: 4, updatedAt: 5, mods: [] },
      ],
    });
    const res = mergeSyncState({ ...base, localInstances: [], remote, tombstones: [] });
    expect(res.instances).toHaveLength(1);
    expect(res.instances[0].dir).toBe("");
    expect(res.instances[0].importedFrom).toBe("dev-b");
    expect(res.applied.added).toBe(1);
  });

  it("两边都有时取新，但本机路径不被覆盖", () => {
    const remote = payload({
      deviceId: "dev-b",
      instances: [
        { id: "i1", name: "改名了", mcVersion: "26.2", loader: "fabric", port: 25565, memoryMin: 2, memoryMax: 16, updatedAt: 20, mods: [] },
      ],
    });
    const res = mergeSyncState({ ...base, localInstances: [inst()], remote, tombstones: [] });
    expect(res.instances[0].name).toBe("改名了");
    expect(res.instances[0].mcVersion).toBe("26.2");
    expect(res.instances[0].dir).toBe("D:\\srv");
    expect(res.applied.updated).toBe(1);
  });

  it("本地更新时保留本地", () => {
    const remote = payload({
      deviceId: "dev-b",
      instances: [
        { id: "i1", name: "旧名", mcVersion: "26.0", loader: "fabric", port: 25565, memoryMin: 2, memoryMax: 4, updatedAt: 5, mods: [] },
      ],
    });
    const res = mergeSyncState({ ...base, localInstances: [inst({ updatedAt: 99 })], remote, tombstones: [] });
    expect(res.instances[0].name).toBe("主服");
    expect(res.applied.updated).toBe(0);
  });

  it("墓碑比两边都新时删除", () => {
    const tomb: SyncTombstone = { kind: "instance", id: "i1", deletedAt: 500 };
    const remote = payload({ deviceId: "dev-b", instances: [] });
    const res = mergeSyncState({ ...base, localInstances: [inst({ updatedAt: 10 })], remote, tombstones: [tomb] });
    expect(res.instances).toHaveLength(0);
    expect(res.applied.deleted).toBe(1);
  });
});
