import { describe, expect, it } from "vitest";
import { javaMajorFor, pickJavaFor } from "./java-compat";

const j = (major: number, path = `C:/Java/${major}/bin/java.exe`) => ({ path, major, version: String(major) });

describe("Java 版本兼容", () => {
  it("26.x 要 Java 25（不是 21）", () => {
    expect(javaMajorFor("26.1")).toBe(25);
    expect(javaMajorFor("26.1.2")).toBe(25);
    expect(javaMajorFor("26.3")).toBe(25);
  });

  it("1.20.5+ 要 21，1.18–1.20.4 要 17，老版本要 8", () => {
    expect(javaMajorFor("1.21.11")).toBe(21);
    expect(javaMajorFor("1.20.6")).toBe(21);
    expect(javaMajorFor("1.20.4")).toBe(17);
    expect(javaMajorFor("1.18.2")).toBe(17);
    expect(javaMajorFor("1.16.5")).toBe(8);
  });

  it("优先选完全匹配的 Java，而不是无脑最新", () => {
    const picked = pickJavaFor([j(21), j(17), j(25)], 17);
    expect(picked?.major).toBe(17);
  });

  it("没有完全匹配时选最低的更高版本", () => {
    const picked = pickJavaFor([j(21), j(25)], 17);
    expect(picked?.major).toBe(21);
  });

  it("都低于要求时返回 null，交给调用方提示", () => {
    expect(pickJavaFor([j(8), j(17)], 21)).toBeNull();
  });
});
