import { afterEach, describe, expect, it, vi } from "vitest";
import { syncClientMods } from "./client-mods";
import type { ModMeta } from "./types";

const mod: ModMeta = {
  file: "demo.jar",
  path: "C:\\client\\mods\\demo.jar",
  id: "demo",
  name: "Demo",
  version: "1.0.0",
  environment: "*",
  size: 10,
  mtime: 0,
};

function stub(overrides: Record<string, unknown> = {}) {
  const copy = vi.fn(async () => "ok");
  const prepare = vi.fn(async () => ({ ok: true, results: [] }));
  const resolve = vi.fn(async () => []);
  vi.stubGlobal("window", {
    mcss: {
      mods: { resolveModrinth: resolve },
      fs: { mkdir: vi.fn(async () => undefined), copy },
      client: { prepare },
      ...overrides,
    },
  });
  return { copy, prepare, resolve };
}

afterEach(() => vi.unstubAllGlobals());

describe("客户端 Mod 同步到服务端", () => {
  it("Modrinth 匹配不到时直接复制本地 jar", async () => {
    const { copy } = stub();
    const res = await syncClientMods("D:\\server", [mod]);
    expect(copy).toHaveBeenCalledWith(mod.path, "D:\\server\\mods\\demo.jar");
    expect(res.copied).toEqual(["demo.jar"]);
  });

  it("Modrinth 匹配到时走下载，并记下邀请码描述符", async () => {
    const { copy, prepare } = stub();
    const resolve = window.mcss.mods.resolveModrinth as ReturnType<typeof vi.fn>;
    resolve.mockResolvedValue([{ file: "demo.jar", p: "proj", v: "ver", n: "demo.jar" }]);
    (prepare as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      results: [{ ok: true, name: "demo.jar", file: "demo.jar" }],
    });
    const res = await syncClientMods("D:\\server", [mod]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(copy).not.toHaveBeenCalled();
    expect(res.index["demo.jar"]).toEqual({ p: "proj", v: "ver", n: "demo.jar" });
  });
});
