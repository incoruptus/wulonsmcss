import { describe, expect, it } from "vitest";
import { buildLaunchPlan, mavenToPath, mergeVersions, rulesAllow, type VersionJson } from "./launch-plan";

const baseVersion: VersionJson = {
  id: "26.1",
  mainClass: "net.minecraft.client.main.Main",
  type: "release",
  assetIndex: { id: "26" },
  libraries: [
    { name: "com.mojang:logging:1.2.1" },
    { name: "org.lwjgl:lwjgl:3.3.3", rules: [{ action: "allow" }] },
    { name: "org.lwjgl:lwjgl-natives:3.3.3", rules: [{ action: "allow", os: { name: "windows" } }] },
  ],
  arguments: {
    game: ["--username", "${auth_player_name}", "--version", "${version_name}"],
    jvm: ["-Djava.library.path=${natives_directory}", { rules: [{ action: "allow", os: { name: "osx" } }], value: "-XstartOnFirstThread" }],
  },
};

const fabricVersion: VersionJson = {
  id: "26.1-fabric",
  inheritsFrom: "26.1",
  mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
  libraries: [{ name: "net.fabricmc:fabric-loader:0.20.1" }, { name: "org.lwjgl:lwjgl:3.3.3" }],
  arguments: { jvm: ["-DFabricMcEmu= net.minecraft.client.main.Main"] },
};

/** 默认所有文件都存在 */
const allExist = async () => true;
const gameDir = "C:\\mc";
const versionDir = "C:\\mc\\versions\\26.1-fabric";

async function plan(overrides: Partial<Parameters<typeof buildLaunchPlan>[0]> = {}) {
  return buildLaunchPlan({
    version: mergeVersions(baseVersion, fabricVersion),
    gameDir,
    versionDir,
    username: "Steve",
    javaPath: "C:\\java\\bin\\java.exe",
    memoryGb: { min: 2, max: 6 },
    platform: "windows",
    exists: allExist,
    nativesDir: "C:\\mc\\natives",
    server: { host: "frp.example.com", port: 25565 },
    ...overrides,
  });
}

describe("maven 坐标转路径", () => {
  it("普通库", () => {
    expect(mavenToPath("net.fabricmc:fabric-loader:0.20.1")).toBe("net\\fabricmc\\fabric-loader\\0.20.1\\fabric-loader-0.20.1.jar");
  });
  it("带分类器", () => {
    expect(mavenToPath("org.lwjgl:lwjgl:3.3.3:natives-windows")).toContain("lwjgl-3.3.3-natives-windows.jar");
  });
  it("坐标不完整返回 null", () => {
    expect(mavenToPath("broken")).toBeNull();
  });
});

describe("规则求值", () => {
  it("没有规则默认允许", () => {
    expect(rulesAllow(undefined, "windows", "x86_64")).toBe(true);
  });
  it("只允许 windows 的库在 mac 上被排除", () => {
    expect(rulesAllow([{ action: "allow", os: { name: "windows" } }], "macos", "x86_64")).toBe(false);
  });
  it("deny 优先", () => {
    expect(rulesAllow([{ action: "allow" }, { action: "deny", os: { name: "windows" } }], "windows", "x86_64")).toBe(false);
  });
});

describe("版本继承合并", () => {
  it("子版本覆盖主类，库取并集且去重", () => {
    const merged = mergeVersions(baseVersion, fabricVersion);
    expect(merged.mainClass).toContain("KnotClient");
    const names = merged.libraries!.map((l) => l.name);
    expect(names.filter((n) => n === "org.lwjgl:lwjgl:3.3.3")).toHaveLength(1);
    expect(names).toContain("net.fabricmc:fabric-loader:0.20.1");
    expect(names).toContain("com.mojang:logging:1.2.1");
  });
});

describe("启动计划", () => {
  it("拼出可直接执行的命令，并带上服务器地址", async () => {
    const result = await plan();
    const cmd = result.command.join(" ");
    expect(result.command[0]).toBe("C:\\java\\bin\\java.exe");
    expect(cmd).toContain("-Xmx6G");
    expect(cmd).toContain("net.fabricmc.loader.impl.launch.knot.KnotClient");
    expect(cmd).toContain("--server frp.example.com");
    expect(cmd).toContain("--port 25565");
    expect(cmd).toContain("--username Steve");
    expect(result.missing).toHaveLength(0);
  });

  it("Windows 上排除 macOS 专属 JVM 参数", async () => {
    const result = await plan();
    expect(result.command.join(" ")).not.toContain("-XstartOnFirstThread");
  });

  it("macOS 上则包含", async () => {
    const result = await plan({ platform: "macos" });
    expect(result.command.join(" ")).toContain("-XstartOnFirstThread");
  });

  it("只加载适用于当前系统的库", async () => {
    const win = await plan();
    const mac = await plan({ platform: "macos" });
    const cpOf = (r: Awaited<ReturnType<typeof plan>>) => r.command[r.command.indexOf("-cp") + 1];

    // 只允许 windows 的库：Windows 上在，macOS 上不在
    expect(cpOf(win)).toContain("lwjgl-natives-3.3.3.jar");
    expect(cpOf(mac)).not.toContain("lwjgl-natives-3.3.3.jar");
    // 通用库两边都在
    expect(cpOf(win)).toContain("lwjgl-3.3.3.jar");
    expect(cpOf(mac)).toContain("lwjgl-3.3.3.jar");
  });

  it("缺文件时记下来而不是抛错", async () => {
    const result = await plan({ exists: async (p) => !p.includes("fabric-loader") });
    expect(result.missing).toContain("net\\fabricmc\\fabric-loader\\0.20.1\\fabric-loader-0.20.1.jar");
    expect(result.warnings.join(" ")).toContain("缺失");
  });

  it("只有 minecraftArguments 的老版本也能拼", async () => {
    const legacy: VersionJson = {
      id: "1.8.9",
      mainClass: "net.minecraft.client.main.Main",
      minecraftArguments: "--username ${auth_player_name} --gameDir ${game_directory}",
    };
    const result = await buildLaunchPlan({
      version: legacy,
      gameDir,
      versionDir,
      username: "Alex",
      javaPath: "java",
      memoryGb: { min: 1, max: 2 },
      platform: "windows",
      exists: allExist,
      nativesDir: "C:\\mc\\natives",
      server: { host: "1.2.3.4", port: 25565 },
    });
    expect(result.command.join(" ")).toContain("--username Alex");
    expect(result.command.join(" ")).toContain("1.2.3.4");
  });
});
