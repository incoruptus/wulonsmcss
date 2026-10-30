import { describe, expect, it } from "vitest";
import { ZH_NAME_COUNT, zhNameOf, zhSearchSlugs } from "./zh-names";

describe("Mod 中文名", () => {
  it("收录了常见 Mod，且不是把英文名反过来", () => {
    expect(ZH_NAME_COUNT).toBeGreaterThan(3000);
    expect(zhNameOf("sodium")).toBe("钠");
    expect(zhNameOf("create")).toBe("机械动力");
    expect(zhNameOf("artifacts")).toBe("奇异饰品");
  });

  it("没有收录的返回 null，不编造", () => {
    expect(zhNameOf("definitely-not-a-real-mod-slug-xyz")).toBeNull();
    expect(zhNameOf(null)).toBeNull();
  });

  it("中文关键词能反查到 slug", () => {
    expect(zhSearchSlugs("机械动力")).toContain("create");
    expect(zhSearchSlugs("钠")).toContain("sodium");
    expect(zhSearchSlugs("奇异饰")).toContain("artifacts");
  });

  it("英文关键词不参与中文名反查（交给 Modrinth 自己搜）", () => {
    expect(zhSearchSlugs("sodium")).toEqual([]);
    expect(zhSearchSlugs("")).toEqual([]);
  });
});
