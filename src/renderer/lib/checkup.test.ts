import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkClient, parseVersionJson } from "./checkup";
import type { RoomDescriptorV1 } from "./room";

const files = new Map<string, string>();
const key = (p: string) => p.replace(/\//g, "\\");
const join = (base: string, ...parts: string[]) => [base, ...parts].join("\\");

function stubFs() {
  const fsApi = {
    list: async (dir: string) => {
      const base = key(dir);
      const names = new Set<string>();
      for (const p of files.keys()) {
        if (p.startsWith(`${base}\\`)) names.add(p.slice(base.length + 1).split("\\")[0] + "\\");
      }
      return [...names].map((n) => ({ name: n.replace(/\\$/, ""), path: `${base}\\${n.replace(/\\$/, "")}`, isDir: true }));
    },
    read: async (p: string) => {
      const v = files.get(key(p));
      if (v === undefined) throw new Error("not found");
      return v;
    },
    exists: async (p: string) => p === "C:\\mc" || [...files.keys()].some((k) => k.startsWith(key(p))),
  };
  const modsApi = {
    scan: async (dir: string) => {
      const base = key(dir);
      return [...files.keys()]
        .filter((p) => p.startsWith(`${base}\\`))
        .map((p) => ({ file: p.slice(base.length + 1), name: p.slice(base.length + 1).replace(/\.jar$/, ""), path: p }));
    },
  };
  vi.stubGlobal("window", { mcss: { fs: fsApi, mods: modsApi } });
}

const room: RoomDescriptorV1 = {
  v: 1,
  name: "朋友的生存服",
  addr: "frp.example.com:25565",
  mc: "26.1",
  loader: "fabric",
  lv: "0.20.1",
  mods: [
    { p: "AANobbMI", v: "uGvVQBnw", n: "Sodium" },
    { p: "P7dR8mSH", v: "3dM0X6ou", n: "Fabric API" },
  ],
};

function addFabricVersion(mcDir: string, id = "26.1-fabric") {
  files.set(
    key(join(mcDir, "versions", id, `${id}.json`)),
    JSON.stringify({
      id,
      inheritsFrom: "26.1",
      libraries: [{ name: "net.fabricmc:fabric-loader:0.20.1" }, { name: "net.fabricmc:intermediary:26.1" }],
    }),
  );
}

beforeEach(() => {
  files.clear();
  stubFs();
});

describe("客户端体检", () => {
  it("版本和 Mod 都齐 → ready", async () => {
    const dir = "C:\\mc";
    addFabricVersion(dir);
    files.set(key(join(dir, "mods", "sodium-fabric-0.8.9.jar")), "");
    files.set(key(join(dir, "mods", "fabric-api-0.155.jar")), "");

    const result = await checkClient(dir, room);
    expect(result.verdict).toBe("ready");
    expect(result.match).toBe("26.1-fabric");
    expect(result.mods.present).toBe(2);
    expect(result.mods.missing).toHaveLength(0);
  });

  it("版本对但缺 Mod → need-mods，并列出缺哪些", async () => {
    const dir = "C:\\mc";
    addFabricVersion(dir);
    files.set(key(join(dir, "mods", "sodium-fabric-0.8.9.jar")), "");

    const result = await checkClient(dir, room);
    expect(result.verdict).toBe("need-mods");
    expect(result.mods.present).toBe(1);
    expect(result.mods.missing.map((m) => m.n)).toEqual(["Fabric API"]);
  });

  it("只有原版没有 fabric → need-version", async () => {
    const dir = "C:\\mc";
    files.set(key(join(dir, "versions", "26.1", "26.1.json")), JSON.stringify({ id: "26.1", libraries: [] }));

    const result = await checkClient(dir, room);
    expect(result.verdict).toBe("need-version");
    expect(result.match).toBeNull();
    expect(result.candidates[0].loader).toBe("vanilla");
  });

  it("没有 .minecraft → no-client", async () => {
    const result = await checkClient("C:\\nothing", room);
    expect(result.verdict).toBe("no-client");
    expect(result.exists).toBe(false);
  });

  it("目录在但没装过游戏 → no-version", async () => {
    files.set(key("C:\\mc\\runtime\\jre\\bin\\java.exe"), "");
    const result = await checkClient("C:\\mc", room);
    expect(result.verdict).toBe("no-version");
    expect(result.exists).toBe(true);
  });

  it("版本 JSON 缺失也不崩", async () => {
    const dir = "C:\\mc";
    files.set(key(join(dir, "versions", "26.1-fabric", "placeholder.txt")), "");
    const result = await checkClient(dir, room);
    expect(result.candidates).toHaveLength(1);
    expect(result.verdict).toBe("need-version");
  });
});

describe("版本 JSON 解析", () => {
  it("从 libraries 认 fabric 与版本号", () => {
    const v = parseVersionJson("fabric-loader-0.20.1-26.1", {
      inheritsFrom: "26.1",
      libraries: [{ name: "net.fabricmc:fabric-loader:0.20.1" }],
    });
    expect(v.loader).toBe("fabric");
    expect(v.loaderVersion).toBe("0.20.1");
    expect(v.mcVersion).toBe("26.1");
  });

  it("识别 quilt / neoforge", () => {
    expect(parseVersionJson("a", { libraries: [{ name: "org.quiltmc:quilt-loader:0.24.0" }] }).loader).toBe("quilt");
    expect(parseVersionJson("b", { libraries: [{ name: "net.neoforged:neoforge:21.1.0" }] }).loader).toBe("neoforge");
  });

  it("没有继承时从 id 推版本", () => {
    const v = parseVersionJson("1.21.4-fabric", { id: "1.21.4-fabric", libraries: [] });
    expect(v.mcVersion).toBe("1.21.4");
  });
});
