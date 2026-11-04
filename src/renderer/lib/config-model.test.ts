import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, clientRequirementOf, contentKindOf, normalizeConfig, serverTypeLabel, serverTypeOf } from "./config-model";

/**
 * 配置 v27 → v28 迁移
 * ------------------------------------------------------------
 * 桌面版和网页版各有一套落盘实现，迁移只能放在这里统一做，
 * 否则两边迟早长得不一样——而"两边一模一样"是不可妥协的点。
 */

const V27 = {
  version: 27,
  theme: "dark",
  accent: "#6d4c41",
  instances: [
    {
      id: "legacy",
      name: "MCServer",
      dir: "D:\\Games\\Minecraft\\MCServer",
      mcVersion: "26.1",
      loader: "fabric",
      loaderVersion: "0.20.1",
      javaPath: "java.exe",
      memoryMin: 2,
      memoryMax: 16,
      jvmArgs: "",
      port: 25565,
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  activeInstanceId: "legacy",
  consoleViewMode: "code",
  maxLogLines: 1000,
  animationsEnabled: true,
  setupComplete: true,
  quickActions: [],
  frpProfiles: [],
  sync: null,
};

describe("配置迁移 v27 → v28", () => {
  it("升级版本号，并把 loader 补成 serverType", () => {
    const { cfg, changed } = normalizeConfig(V27, { defaultMode: "host" });
    expect(changed).toBe(true);
    expect(cfg.version).toBe(CONFIG_VERSION);
    expect(cfg.instances[0].serverType).toBe("fabric");
    expect(cfg.instances[0].loader).toBe("fabric");
  });

  it("老配置没有 mode：按平台默认，并标记为『还没问过』", () => {
    const host = normalizeConfig(V27, { defaultMode: "host" }).cfg;
    expect(host.mode).toBe("host");
    expect(host.modeAsked).toBe(false);

    const player = normalizeConfig(V27, { defaultMode: "player" }).cfg;
    expect(player.mode).toBe("player");
  });

  it("已经选过模式的配置不再重复询问", () => {
    const { cfg } = normalizeConfig({ ...V27, mode: "player", modeAsked: true }, { defaultMode: "host" });
    expect(cfg.mode).toBe("player");
    expect(cfg.modeAsked).toBe(true);
  });

  it("玩家侧的新数组会被补成空数组，不是 undefined", () => {
    const { cfg } = normalizeConfig(V27, { defaultMode: "host" });
    expect(cfg.clientProfiles).toEqual([]);
    expect(cfg.savedServers).toEqual([]);
  });

  it("实例一个都不能丢，字段也不能丢", () => {
    const { cfg } = normalizeConfig(V27, { defaultMode: "host" });
    expect(cfg.instances).toHaveLength(1);
    expect(cfg.instances[0].memoryMax).toBe(16);
    expect(cfg.instances[0].loaderVersion).toBe("0.20.1");
    expect(cfg.activeInstanceId).toBe("legacy");
  });

  it("迁移是幂等的：第二次不再改任何东西", () => {
    const once = normalizeConfig(V27, { defaultMode: "host" }).cfg;
    const twice = normalizeConfig(once, { defaultMode: "player" });
    expect(twice.changed).toBe(false);
    // 模式以用户的选择为准，不会被默认值覆盖
    expect(twice.cfg.mode).toBe(once.mode);
  });

  it("空/坏的配置给一份可用的默认值，而不是抛错", () => {
    for (const bad of [null, undefined, 42, "x", {}]) {
      const { cfg } = normalizeConfig(bad, { defaultMode: "host" });
      expect(cfg.version).toBe(CONFIG_VERSION);
      expect(Array.isArray(cfg.instances)).toBe(true);
    }
  });

  it("实例字段是脏的时候有兜底（端口 / 内存 / 名字）", () => {
    const { cfg } = normalizeConfig(
      { version: 28, instances: [{ dir: "D:\\srv", port: 99999, memoryMax: 0, name: "" }] },
      { defaultMode: "host" },
    );
    expect(cfg.instances[0].port).toBe(25565);
    expect(cfg.instances[0].memoryMax).toBe(4);
    expect(cfg.instances[0].name).toBe("我的服务器");
    expect(cfg.instances[0].serverType).toBe("fabric"); // 缺字段时的历史默认
  });

  it("serverType 优先于 loader（配置被手改过时以新字段为准）", () => {
    const { cfg } = normalizeConfig(
      { version: 28, instances: [{ dir: "D:\\srv", loader: "fabric", serverType: "paper" }] },
      { defaultMode: "host" },
    );
    expect(cfg.instances[0].serverType).toBe("paper");
    expect(cfg.instances[0].loader).toBe("paper");
  });
});

describe("核心类型 → 内容类型", () => {
  it("插件服只做插件，模组服只做模组，原版只有数据包", () => {
    expect(contentKindOf("paper")).toBe("plugin");
    expect(contentKindOf("purpur")).toBe("plugin");
    expect(contentKindOf("fabric")).toBe("mod");
    expect(contentKindOf("forge")).toBe("mod");
    expect(contentKindOf("neoforge")).toBe("mod");
    expect(contentKindOf("vanilla")).toBe("datapack");
  });

  it("能对玩家说人话：原版/插件服不用装东西", () => {
    expect(clientRequirementOf("paper")).toContain("原版客户端");
    expect(clientRequirementOf("purpur")).toContain("原版客户端");
    expect(clientRequirementOf("fabric")).toContain("Fabric");
    expect(clientRequirementOf("neoforge")).toContain("NeoForge");
  });

  it("显示名", () => {
    expect(serverTypeLabel("neoforge")).toBe("NeoForge");
    expect(serverTypeLabel("vanilla")).toBe("原版");
  });

  it("serverTypeOf 兼容只有 loader 的老实例", () => {
    expect(serverTypeOf({ loader: "vanilla" })).toBe("vanilla");
    expect(serverTypeOf({ serverType: "paper", loader: "fabric" })).toBe("paper");
    expect(serverTypeOf({})).toBe("fabric");
  });
});

describe("茶色主题迁移", () => {
  it("老配置没有 palette 时补默认白茶", () => {
    const { cfg, changed } = normalizeConfig(V27, { defaultMode: "host" });
    expect(cfg.palette).toBe("white");
    expect(cfg.palettePicked).toBe(false);
    expect(changed).toBe(true);
  });

  it("没主动选过的旧默认绿茶也迁到白茶；主动选过的保留", () => {
    const untouched = normalizeConfig({ ...V27, version: 28, palette: "green" }, { defaultMode: "host" }).cfg;
    expect(untouched.palette).toBe("white");
    expect(untouched.palettePicked).toBe(false);

    const picked = normalizeConfig(
      { ...V27, version: 28, palette: "red", palettePicked: true },
      { defaultMode: "host" },
    ).cfg;
    expect(picked.palette).toBe("red");
    expect(picked.palettePicked).toBe(true);
  });

  it("非法茶色回退白茶", () => {
    expect(
      normalizeConfig({ ...V27, version: 28, palette: "oolong", palettePicked: true }, { defaultMode: "host" }).cfg.palette,
    ).toBe("white");
  });
  it("实例的 lifecycle 会原样保留：临时房间不会被读回时重置", () => {
    const room = normalizeConfig(
      {
        ...V27,
        version: 28,
        instances: [{ ...V27.instances[0], lifecycle: "room" }],
      },
      { defaultMode: "host" },
    ).cfg;
    expect(room.instances[0].lifecycle).toBe("room");

    const legacy = normalizeConfig(
      { ...V27, version: 28, instances: [{ ...V27.instances[0] }] },
      { defaultMode: "host" },
    ).cfg;
    expect(legacy.instances[0].lifecycle).toBe("persistent");
  });

});
