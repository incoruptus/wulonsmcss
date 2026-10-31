import { beforeEach, describe, expect, it, vi } from "vitest";

/** 用内存文件系统模拟 agent / Electron 的 fs 通道 */
const files = new Map<string, string>();
const dirs = new Set<string>();

function key(p: string) {
  return p.replace(/\//g, "\\");
}

const fsApi = {
  list: async (dir: string) => {
    const base = key(dir).replace(/\\$/, "");
    const names = new Set<string>();
    for (const p of files.keys()) {
      if (p.startsWith(`${base}\\`)) {
        const rest = p.slice(base.length + 1);
        if (rest.includes("\\")) {
          names.add(rest.split("\\")[0] + "\\");
        } else {
          names.add(rest);
        }
      }
    }
    for (const d of dirs) {
      if (d.startsWith(`${base}\\`) && !d.slice(base.length + 1).includes("\\")) {
        names.add(d.slice(base.length + 1) + "\\");
      }
    }
    return [...names].map((n) => ({
      name: n.replace(/\\$/, ""),
      path: `${base}\\${n.replace(/\\$/, "")}`,
      isDir: n.endsWith("\\"),
    }));
  },
  read: async (p: string) => {
    const value = files.get(key(p));
    if (value === undefined) throw new Error("not found");
    return value;
  },
  write: async (p: string, content: string) => {
    files.set(key(p), content);
    return null;
  },
  remove: async (p: string) => {
    const base = key(p);
    for (const k of [...files.keys()]) if (k === base || k.startsWith(`${base}\\`)) files.delete(k);
    return null;
  },
  mkdir: async (p: string) => {
    dirs.add(key(p));
    return null;
  },
};

beforeEach(() => {
  files.clear();
  dirs.clear();
  vi.stubGlobal("window", { mcss: { fs: fsApi } });
});

describe("多世界服务", () => {
  it("生成数据包并写进 world/datapacks", async () => {
    const worlds = await import("./worlds");
    const res = await worlds.create("D:\\srv", { name: "sky", label: "空岛", type: "void", description: "空岛", namespace: "wulons" });
    expect(res.success).toBe(true);
    expect(res.packName).toBe("mwm-wulons-sky");

    const written = [...files.keys()].filter((k) => k.includes("mwm-wulons-sky"));
    expect(written.some((k) => k.endsWith("pack.mcmeta"))).toBe(true);
    expect(written.some((k) => k.includes("dimension_type"))).toBe(true);
    expect(written.some((k) => k.includes("\\dimension\\sky.json"))).toBe(true);

    const dimension = JSON.parse(files.get("D:\\srv\\world\\datapacks\\mwm-wulons-sky\\data\\wulons\\dimension\\sky.json")!);
    expect(dimension.generator.type).toBe("minecraft:flat");
  });

  it("扫描能读回世界数量与类型", async () => {
    const worlds = await import("./worlds");
    await worlds.create("D:\\srv", { name: "hell", label: "地狱", type: "nether", namespace: "wulons" });
    const packs = await worlds.scan("D:\\srv");
    expect(packs).toHaveLength(1);
    expect(packs[0].name).toBe("mwm-wulons-hell");
    expect(packs[0].worlds).toHaveLength(1);
    expect(packs[0].worlds[0].id).toBe("wulons:hell");
    expect(packs[0].worlds[0].generator).toBe("minecraft:noise");
  });

  it("旧版本被拒绝，不会写出 26.1 数据包", async () => {
    const worlds = await import("./worlds");
    const res = await worlds.create("D:\\srv", { name: "old", type: "void" }, "1.20.1");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/26\.1/);
    expect([...files.keys()].some((k) => k.includes("mwm-wulons-old"))).toBe(false);
    expect((await worlds.repair("D:\\srv", "1.20.1")).success).toBe(false);
  });

  it("非法世界名被拒绝", async () => {
    const worlds = await import("./worlds");
    const res = await worlds.create("D:\\srv", { name: "../evil", type: "void" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/世界名/);
  });

  it("删除只接受 mwm- 前缀", async () => {
    const worlds = await import("./worlds");
    expect((await worlds.remove("D:\\srv", "../../etc")).success).toBe(false);
    expect((await worlds.remove("D:\\srv", "mwm-wulons-sky")).success).toBe(true);
  });
});
