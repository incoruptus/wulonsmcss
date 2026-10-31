import { describe, expect, it } from "vitest";
import { addMessages, translate } from "./core";

describe("i18n 内核", () => {
  it("没有词典时回退到调用处中文，不暴露 key", () => {
    expect(translate("en-US", "nav.overview", "总览")).toBe("总览");
  });

  it("英文缺失时回退中文，再回退 fallback", () => {
    addMessages("zh-CN", { "test.chineseOnly": "只有中文" });
    expect(translate("en-US", "test.chineseOnly", "兜底")).toBe("只有中文");
    expect(translate("en-US", "test.missing", "兜底")).toBe("兜底");
  });

  it("按当前语言取词并替换占位符", () => {
    addMessages("en-US", { "test.players": "{count} players online" });
    expect(translate("en-US", "test.players", "在线 {count} 人", { count: 3 })).toBe("3 players online");
    expect(translate("zh-CN", "test.players", "在线 {count} 人", { count: 3 })).toBe("在线 3 人");
  });

  it("保留未提供的占位符，布尔 false 与数字 0 正常输出", () => {
    addMessages("zh-CN", { "test.flags": "{zero}/{off}/{missing}" });
    expect(translate("zh-CN", "test.flags", "", { zero: 0, off: false })).toBe("0/false/{missing}");
  });
});
