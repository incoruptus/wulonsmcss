import { describe, expect, it } from "vitest";
import { compareMcVersion, dimensionSupport, dimensionSupportMessage } from "./mc-version";

describe("Minecraft 版本判断", () => {
  it("按数字段比较，不按字符串", () => {
    expect(compareMcVersion("1.20.1", "1.16.2")).toBeGreaterThan(0);
    expect(compareMcVersion("1.21.11", "1.21.9")).toBeGreaterThan(0);
    expect(compareMcVersion("26.1", "26.1.0")).toBe(0);
    expect(compareMcVersion("1.12.2", "1.16.2")).toBeLessThan(0);
  });

  it("1.12 不支持数据包维度，1.20 是格式不兼容，26.1 才是当前生成器目标", () => {
    expect(dimensionSupport("1.12.2")).toBe("unsupported");
    expect(dimensionSupport("1.20.1")).toBe("legacy");
    expect(dimensionSupport("1.21.11")).toBe("legacy");
    expect(dimensionSupport("26.1")).toBe("supported");
    expect(dimensionSupport("26.3")).toBe("supported");
  });

  it("无法识别版本时不放行", () => {
    expect(dimensionSupport("")).toBe("unknown");
    expect(dimensionSupport("snapshot-26w")).toBe("unknown");
    expect(dimensionSupportMessage("1.12.2")).toContain("mod 或插件");
    expect(dimensionSupportMessage("1.20.1")).toContain("26.1");
  });
});
