import { describe, expect, it } from "vitest";
import { normalizeLoaders, pickLoader } from "./loaders";

/**
 * 回归：fabric-loaders 通道的形状
 * 27.0.0 的黑屏事故：后端返回 [{version, stable}]，渲染层当 string[] 用，
 * 对象进了 <option>，React 抛 #31 把整棵树卸载 → 纯黑窗口。
 */
describe("Fabric Loader 列表归一化", () => {
  it("字符串数组原样通过", () => {
    expect(normalizeLoaders(["0.16.9", "0.16.8"])).toEqual(["0.16.9", "0.16.8"]);
  });

  it("对象数组取出 version（兼容旧后端）", () => {
    expect(
      normalizeLoaders([
        { version: "0.16.9", stable: true },
        { version: "0.16.8", stable: false },
      ]),
    ).toEqual(["0.16.9", "0.16.8"]);
  });

  it("混合 / 脏数据不会漏出非字符串", () => {
    const out = normalizeLoaders([null, 42, {}, { version: "" }, "  ", "0.16.9", { version: 7 }, { version: "0.16.9" }]);
    expect(out).toEqual(["0.16.9"]);
    for (const v of out) expect(typeof v).toBe("string");
  });

  it("完全不是数组时给空列表，而不是抛错", () => {
    expect(normalizeLoaders(undefined)).toEqual([]);
    expect(normalizeLoaders(null)).toEqual([]);
    expect(normalizeLoaders({ version: "0.16.9" })).toEqual([]);
    expect(normalizeLoaders("0.16.9")).toEqual([]);
  });
});

describe("选中项兜底", () => {
  it("当前值还在就保留", () => {
    expect(pickLoader("0.16.8", ["0.16.9", "0.16.8"])).toBe("0.16.8");
  });

  it("当前值消失就退回第一个", () => {
    expect(pickLoader("0.1.0", ["0.16.9"])).toBe("0.16.9");
  });

  it("列表为空给空串（不是 undefined）", () => {
    expect(pickLoader("0.16.9", [])).toBe("");
  });
});
