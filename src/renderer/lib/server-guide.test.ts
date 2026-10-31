import { describe, expect, it } from "vitest";
import {
  CORES,
  INTENTS,
  buildVersionPresets,
  clientRequirementText,
  coreMeta,
  recommendedCore,
  recommendedVersion,
} from "./server-guide";
import type { McVersion } from "./types";

const releases = [
  { id: "26.3", type: "release", releaseTime: "2026-09-15T11:23:02+00:00" },
  { id: "26.1.2", type: "release", releaseTime: "2026-04-09T10:12:23+00:00" },
  { id: "1.21.11", type: "release", releaseTime: "2025-12-09T12:23:30+00:00" },
  { id: "1.21.1", type: "release", releaseTime: "2024-08-08T12:00:00+00:00" },
] as McVersion[];

describe("开服向导的人话推荐", () => {
  const presets = buildVersionPresets(releases);

  it("只保留清单里真实存在的版本", () => {
    expect(presets.map((p) => p.id)).toEqual(["26.3", "26.1.2", "1.21.11", "1.21.1"]);
  });

  it("原版/插件选最新，模组选 1.21.11", () => {
    expect(recommendedVersion("vanilla", presets)).toBe("26.3");
    expect(recommendedVersion("plugins", presets)).toBe("26.3");
    expect(recommendedVersion("mods", presets)).toBe("1.21.11");
  });

  it("模组平台只推荐 Fabric；NeoForge 暂不支持新建", () => {
    expect(recommendedCore("mods", "1.21.11")).toBe("fabric");
    expect(recommendedCore("mods", "1.21.1")).toBe("fabric");
    expect(recommendedCore("mods", "26.3")).toBe("fabric");
    expect(CORES.find((c) => c.type === "neoforge")?.supported).toBe(false);
    expect(coreMeta("neoforge")?.caveat).toContain("暂不支持");
  });

  it("每种意图都有可选，且不把核心黑话直接给用户", () => {
    expect(INTENTS).toHaveLength(3);
    expect(coreMeta("paper")?.client).toContain("无需安装");
    expect(clientRequirementText("paper")).toContain("无需安装");
    expect(clientRequirementText("fabric")).toContain("加载器");
  });
});
