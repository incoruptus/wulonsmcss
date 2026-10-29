import { beforeEach, describe, expect, it, vi } from "vitest";
import { findMatchingVersion, mcVersionOf, planFromDisk, resolveVersionJson } from "./launch";

const files = new Map<string, string>();
const key = (p: string) => p.replace(/\//g, "\\");
const join = (base: string, ...parts: string[]) => [base, ...parts].join("\\");
const mcDir = "C:\\mc";

function stubFs() {
  vi.stubGlobal("window", {
    mcss: {
      fs: {
        list: async (dir: string) => {
          const base = key(dir);
          const names = new Set<string>();
          for (const p of files.keys()) {
            if (p.startsWith(`${base}\\`)) names.add(p.slice(base.length + 1).split("\\")[0]);
          }
          return [...names].map((n) => ({ name: n, path: join(base, n), isDir: true, size: 0 }));
        },
        read: async (p: string) => {
          const v = files.get(key(p));
          if (v === undefined) throw new Error("not found");
          return v;
        },
        exists: async (p: string) => files.has(key(p)),
      },
    },
  });
}

function addVersion(id: string, json: Record<string, unknown>) {
  files.set(key(join(mcDir, "versions", id, `${id}.json`)), JSON.stringify(json));
  // 伪造 jar 与一个库，让 exists 都为真
  files.set(key(join(mcDir, "versions", id, `${id}.jar`)), "");
  files.set(key(join(mcDir, "libraries", "net", "fabricmc", "fabric-loader", "0.20.1", "fabric-loader-0.20.1.jar")), "");
}

beforeEach(() => {
  files.clear();
  stubFs();
});

describe("版本解析", () => {
  it("能展开 inheritsFrom 合并出完整版本", async () => {
    addVersion("26.1", { id: "26.1", mainClass: "net.minecraft.client.main.Main", libraries: [{ name: "com.mojang:logging:1.2.1" }] });
    addVersion("26.1-fabric", {
      id: "26.1-fabric",
      inheritsFrom: "26.1",
      mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
      libraries: [{ name: "net.fabricmc:fabric-loader:0.20.1" }],
    });

    const json = await resolveVersionJson(mcDir, "26.1-fabric");
    expect(json?.mainClass).toContain("KnotClient");
    expect(json?.libraries?.map((l) => l.name)).toContain("com.mojang:logging:1.2.1");
  });

  it("按房间的 mc 版本 + 加载器找版本", async () => {
    addVersion("26.1", { id: "26.1", mainClass: "net.minecraft.client.main.Main" });
    addVersion("26.1-fabric", { id: "26.1-fabric", inheritsFrom: "26.1", libraries: [{ name: "net.fabricmc:fabric-loader:0.20.1" }] });

    const found = await findMatchingVersion(mcDir, { mc: "26.1", loader: "fabric" });
    expect(found?.id).toBe("26.1-fabric");

    const wrongLoader = await findMatchingVersion(mcDir, { mc: "26.1", loader: "forge" });
    expect(wrongLoader).toBeNull();
  });

  it("没有 .minecraft 时返回 null 而不是抛错", async () => {
    expect(await findMatchingVersion("C:\\nothing", { mc: "26.1", loader: "fabric" })).toBeNull();
  });

  it("PCL2 风格的合并版（id 里带加载器、没有 inheritsFrom）也能匹配", async () => {
    // 真机实测：D:\Games\Minecraft\.minecraft\versions\26.1-Fabric 0.19.3
    // 它的 json 没有 inheritsFrom，id 就是 "26.1-Fabric 0.19.3"
    addVersion("26.1-Fabric 0.19.3", {
      id: "26.1-Fabric 0.19.3",
      mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
      libraries: [{ name: "net.fabricmc:fabric-loader:0.19.3" }],
    });

    const found = await findMatchingVersion(mcDir, { mc: "26.1", loader: "fabric" });
    expect(found?.id).toBe("26.1-Fabric 0.19.3");

    // 别的 MC 版本不能误匹配
    expect(await findMatchingVersion(mcDir, { mc: "1.21.1", loader: "fabric" })).toBeNull();
  });

  it("mcVersionOf：继承优先，其次从 id 前缀取，取不到就是 null", () => {
    expect(mcVersionOf({ inheritsFrom: "1.21.1", id: "fabric-loader-0.16-1.21.1" })).toBe("1.21.1");
    expect(mcVersionOf({ id: "26.1-Fabric 0.19.3" })).toBe("26.1");
    expect(mcVersionOf({ id: "1.21.1-Fabric_0.16.1" })).toBe("1.21.1");
    expect(mcVersionOf({ id: "Slimes Adventure" })).toBeNull();
    expect(mcVersionOf({ id: "" })).toBeNull();
  });
});

describe("从磁盘生成启动计划", () => {
  it("找不到版本时给空命令和可读提示", async () => {
    const plan = await planFromDisk({
      mcDir,
      room: { mc: "26.1", loader: "fabric", addr: "frp.example.com:25565" },
      username: "Steve",
      javaPath: "java",
      memoryGb: { min: 2, max: 4 },
    });
    expect(plan.command).toHaveLength(0);
    expect(plan.warnings.join(" ")).toContain("没找到 26.1");
    expect(plan.versionId).toBeNull();
  });

  it("找到版本时命令里带着服务器地址", async () => {
    addVersion("26.1", {
      id: "26.1",
      mainClass: "net.minecraft.client.main.Main",
      libraries: [],
      arguments: { game: ["--username", "${auth_player_name}"], jvm: [] },
    });
    addVersion("26.1-fabric", {
      id: "26.1-fabric",
      inheritsFrom: "26.1",
      mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
      libraries: [{ name: "net.fabricmc:fabric-loader:0.20.1" }],
    });

    const plan = await planFromDisk({
      mcDir,
      room: { mc: "26.1", loader: "fabric", addr: "192.168.1.9:25565" },
      username: "Steve",
      javaPath: "C:\\java\\bin\\java.exe",
      memoryGb: { min: 2, max: 6 },
    });

    const cmd = plan.command.join(" ");
    expect(plan.versionId).toBe("26.1-fabric");
    expect(cmd).toContain("--server 192.168.1.9");
    expect(cmd).toContain("--port 25565");
    expect(cmd).toContain("-Xmx6G");
    expect(cmd).toContain("KnotClient");
  });
});
