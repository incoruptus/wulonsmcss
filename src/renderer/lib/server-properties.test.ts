import { describe, expect, it } from "vitest";
import { BOOL_META, BOOL_ORDER, SELECT_META, TEXT_META } from "./server-properties";

describe("server.properties 人话词典", () => {
  it("每个开关都有中文名，且顺序里不漏", () => {
    for (const key of BOOL_ORDER) expect(BOOL_META[key]?.label, key).toBeTruthy();
    expect(BOOL_ORDER).not.toContain("force-gamemode"); // 单独一个控件，避免重复
  });

  it("难度/模式/地图的值都有中文选项", () => {
    for (const key of ["difficulty", "gamemode", "leveltype"]) {
      const meta = SELECT_META[key];
      expect(meta?.label).toBeTruthy();
      for (const opt of meta.options) {
        expect(opt.label).not.toBe(opt.value);
      }
    }
  });

  it("常用的 7 个文本键都有标签", () => {
    for (const key of ["motd", "max-players", "server-port", "view-distance", "simulation-distance", "spawn-protection", "level-seed"]) {
      expect(TEXT_META[key]?.label, key).toBeTruthy();
    }
  });

  it("online-mode 的解释明确提到正版和冒用", () => {
    expect(BOOL_META["online-mode"].label).toContain("正版");
    expect(BOOL_META["online-mode"].hint ?? "").toContain("冒用");
  });
});
