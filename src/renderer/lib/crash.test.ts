import { describe, expect, it } from "vitest";
import { collectMods, diagnose } from "./crash";

describe("崩溃诊断", () => {
  it("识别 Java 版本过低", () => {
    const d = diagnose(["java.lang.UnsupportedClassVersionError: net/minecraft/server/Main has been compiled by a more recent version"]);
    expect(d?.id).toBe("java-version");
    expect(d?.actions[0].kind).toBe("change-java");
  });

  it("识别端口占用", () => {
    const d = diagnose(["**** FAILED TO BIND TO PORT!", "Perhaps a server is already running on that port?"]);
    expect(d?.id).toBe("port-busy");
  });

  it("识别内存溢出", () => {
    expect(diagnose(["java.lang.OutOfMemoryError: Java heap space"])?.id).toBe("oom");
  });

  it("识别数据包格式问题并给出修复动作", () => {
    const d = diagnose(["[Server thread/ERROR]: Failed to load registries due to errors", "No key has_ender_dragon_fight"]);
    expect(d?.id).toBe("registry");
    expect(d?.actions[0].kind).toBe("repair-datapacks");
  });

  it("识别 Mod 依赖问题并挖出 mod id", () => {
    const d = diagnose([
      "net.fabricmc.loader.impl.FormattedException: Mod resolution encountered an incompatible mod set!",
      "Missing or unsupported mandatory dependencies:",
      "\tMod 'Sodium' (sodium) 0.5.8 requires any version of fabric-api, which is missing!",
    ]);
    expect(d?.id).toBe("missing-dep");
    expect(d?.mods?.length).toBeGreaterThan(0);
  });

  it("从堆栈里挖 mod 名", () => {
    const mods = collectMods("at net.coderbot.iris.Iris.<init>(Iris.java:12) ~[iris.jar] from mod iris");
    expect(mods).toContain("iris");
  });

  it("噪声不误报", () => {
    expect(collectMods("from mod minecraft")).toHaveLength(0);
  });

  it("没线索时返回 null，有异常但认不出时给兜底", () => {
    expect(diagnose(["Done (2.0s)! For help, type help"])).toBeNull();
    expect(diagnose(["Caused by: something weird"])?.id).toBe("unknown");
  });
});
