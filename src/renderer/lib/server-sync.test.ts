import { describe, expect, it } from "vitest";
import { planFromDiff, type DiffLike } from "./server-sync";
import type { ModMeta } from "./types";

const mod = (file: string, environment: ModMeta["environment"], path = `C:\\srv\\mods\\${file}`, version = "1.0"): ModMeta => ({
  file,
  path,
  id: file.replace(/\.jar$/, ""),
  name: file,
  version,
  environment,
  size: 1,
  mtime: 1,
});

describe("服务端 → 客户端同步计划", () => {
  it("缺的、双端都要的 → 复制", () => {
    const rows: DiffLike[] = [{ status: "server-only", server: mod("sodium.jar", "*") }];
    expect(planFromDiff(rows).add.map((m) => m.file)).toEqual(["sodium.jar"]);
  });

  it("纯服务端 Mod 不复制到客户端", () => {
    const plan = planFromDiff([{ status: "server-only", server: mod("chunky.jar", "server") }]);
    expect(plan.add).toHaveLength(0);
    expect(plan.serverOnly).toBe(1);
  });

  it("版本不一致只提示，不覆盖", () => {
    const plan = planFromDiff([{ status: "version", server: mod("fabric-api.jar", "*", "C:\\srv\\mods\\fabric-api.jar", "2.0") }]);
    expect(plan.add).toHaveLength(0);
    expect(plan.conflict).toHaveLength(1);
  });

  it("云端清单没有路径的不硬复制", () => {
    const plan = planFromDiff([{ status: "server-only", server: mod("x.jar", "*", "") }]);
    expect(plan.add).toHaveLength(0);
    expect(plan.noFile).toBe(1);
  });

  it("客户端独有的和已一致的不动", () => {
    const plan = planFromDiff([
      { status: "client-only", client: mod("shader.jar", "client") },
      { status: "same", server: mod("a.jar", "*"), client: mod("a.jar", "*") },
    ]);
    expect(plan.add).toHaveLength(0);
    expect(plan.conflict).toHaveLength(0);
  });
});
