import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../types";
import type { MergeResult } from "./merge";
import type { SyncPayloadV1 } from "./types";

/**
 * Gist 同步的端到端往返
 * ------------------------------------------------------------
 * 不需要真 token：用内存里的假 Gist 服务顶替 api.github.com（只实现用到的那四个接口），
 * 然后让两台「设备」用同一个配对码跑完整的 push → 发现 → pull → merge。
 * 顺便验证 Gist 里躺着的确实是密文。
 */

interface FakeGist {
  id: string;
  description: string;
  updated_at: string;
  files: Map<string, string>;
}

function installFakeGist() {
  const gists = new Map<string, FakeGist>();
  const hits: string[] = [];
  let seq = 0;

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  const asResponse = (gist: FakeGist) => ({
    id: gist.id,
    description: gist.description,
    updated_at: gist.updated_at,
    files: Object.fromEntries([...gist.files].map(([name, content]) => [name, { content }])),
  });

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = new Headers(init?.headers).get("authorization");
    hits.push(`${method} ${url.pathname}`);

    if (auth !== "Bearer test-token") return json({ message: "Bad credentials" }, 401);

    const body = init?.body ? (JSON.parse(String(init.body)) as { description?: string; files?: Record<string, { content: string } | null> }) : null;

    if (url.pathname === "/gists" && method === "POST") {
      const gist: FakeGist = {
        id: `g${++seq}`,
        description: body?.description ?? "",
        updated_at: new Date(Date.now() + seq).toISOString(),
        files: new Map(),
      };
      for (const [name, file] of Object.entries(body?.files ?? {})) {
        if (file?.content !== undefined) gist.files.set(name, file.content);
      }
      gists.set(gist.id, gist);
      return json(asResponse(gist), 201);
    }

    if (url.pathname === "/gists" && method === "GET") {
      return json([...gists.values()].map((g) => ({ ...asResponse(g), files: Object.fromEntries([...g.files.keys()].map((n) => [n, {}])) })));
    }

    const match = /^\/gists\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const gist = gists.get(match[1]);
      if (!gist) return json({ message: "Not Found" }, 404);

      if (method === "PATCH") {
        for (const [name, file] of Object.entries(body?.files ?? {})) {
          if (file === null) gist.files.delete(name);
          else if (file?.content !== undefined) gist.files.set(name, file.content);
        }
        gist.updated_at = new Date(Date.now() + ++seq).toISOString();
        return json(asResponse(gist));
      }
      return json(asResponse(gist));
    }

    return json({ message: "Not Found" }, 404);
  });

  return { gists, hits };
}

function makeConfig(deviceId: string, instanceName: string, gistId: string | null = null): AppConfig {
  return {
    version: 27,
    theme: "dark",
    instances: [
      {
        id: "i1",
        name: instanceName,
        dir: "D:\\srv",
        mcVersion: "26.1",
        loader: "fabric",
        loaderVersion: "0.20.1",
        javaPath: "java",
        memoryMin: 2,
        memoryMax: 8,
        jvmArgs: "",
        port: 25565,
        createdAt: 1,
        updatedAt: Date.now(),
      },
    ],
    quickActions: [],
    frpProfiles: [],
    sync: {
      enabled: true,
      autoSync: false,
      token: "test-token",
      gistId,
      pairCode: "AAAA-BBBB-CCCC-DDDD-EEEE",
      deviceId,
      tombstones: [],
      lastSyncAt: null,
      excludeGistIds: [],
    },
  } as unknown as AppConfig;
}

function depsFor(holder: { cfg: AppConfig }, applied: MergeResult[] = []) {
  const saved: Record<string, unknown>[] = [];
  return {
    saved,
    deps: {
      getConfig: () => holder.cfg,
      scanMods: async () => [],
      applyResult: async (result: MergeResult) => {
        applied.push(result);
      },
      saveSync: async (patch: Record<string, unknown>) => {
        saved.push(patch);
        Object.assign(holder.cfg.sync!, patch);
        if (patch.gistId) holder.cfg.sync!.gistId = patch.gistId as string;
      },
    },
  };
}

async function freshEngine() {
  vi.resetModules();
  const mod = await import("./engine");
  mod.markIdle();
  return mod;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gist 同步端到端", () => {
  it("A 推送 → B 发现并合并 → Gist 里只有密文", async () => {
    const fake = installFakeGist();
    const engine = await freshEngine();

    // 设备 A：本机有一个实例
    const a = { cfg: makeConfig("dev-a", "A 的服务器") };
    const aApplied: MergeResult[] = [];
    const aDeps = depsFor(a, aApplied);
    const outA = await engine.runSync(aDeps.deps, { manual: true });
    expect(outA.pushed).toBe(true);
    expect(a.cfg.sync!.gistId).toBeTruthy();
    const gistId = a.cfg.sync!.gistId!;

    // 设备 B：还不知道 gistId，靠配对码描述去发现
    const b = { cfg: makeConfig("dev-b", "B 的服务器") };
    const bApplied: MergeResult[] = [];
    const bDeps = depsFor(b, bApplied);
    const outB = await engine.runSync(bDeps.deps, { manual: true });
    expect(outB.pulled).toBe(true);
    expect(b.cfg.sync!.gistId).toBe(gistId);
    expect(bApplied.length).toBeGreaterThan(0);

    // 线上存的是密文：不能出现实例名或明文 JSON
    const stored = [...fake.gists.get(gistId)!.files.values()].join("\n");
    expect(stored).not.toContain("A 的服务器");
    expect(stored).not.toContain('"instances"');
    expect(stored.length).toBeGreaterThan(20);
  });

  it("配对码不同的设备不会互相认领", async () => {
    const fake = installFakeGist();
    const engine = await freshEngine();

    const a = { cfg: makeConfig("dev-a", "A 的服务器") };
    await engine.runSync(depsFor(a).deps, { manual: true });
    const gistId = a.cfg.sync!.gistId!;

    const c = { cfg: makeConfig("dev-c", "C 的服务器") };
    c.cfg.sync!.pairCode = "ZZZZ-YYYY-XXXX-WWWW-VVVV";
    const appliedC: MergeResult[] = [];
    const outC = await engine.runSync(depsFor(c, appliedC).deps, { manual: true });

    // 解不开 A 的密文 → 不会认领那个 Gist，而是自己新建一个
    expect(c.cfg.sync!.gistId).not.toBe(gistId);
    expect(appliedC).toHaveLength(0);
    expect(fake.gists.size).toBe(2);
    expect(outC.pushed).toBe(true);
  });

  it("Token 无效时给出可读错误", async () => {
    installFakeGist();
    const engine = await freshEngine();
    const a = { cfg: makeConfig("dev-a", "A 的服务器") };
    a.cfg.sync!.token = "wrong";
    await expect(engine.runSync(depsFor(a).deps, { manual: true })).rejects.toThrow();
  });
});
