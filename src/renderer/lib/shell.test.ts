import { describe, expect, it } from "vitest";
import { extractAgentToken, isLoopbackUrl } from "./shell";

describe("agent 地址信任边界", () => {
  it("只接受本机回环地址", () => {
    expect(isLoopbackUrl("http://127.0.0.1:28471")).toBe(true);
    expect(isLoopbackUrl("http://localhost:28471")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:28471")).toBe(true);
  });

  it("拒绝公网/任意主机（P0 令牌外泄链的入口）", () => {
    expect(isLoopbackUrl("http://attacker.tld")).toBe(false);
    expect(isLoopbackUrl("https://evil.example/mcss")).toBe(false);
    expect(isLoopbackUrl("http://127.0.0.1.evil.tld")).toBe(false);
    expect(isLoopbackUrl("file:///C:/Windows")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});

describe("配对令牌从地址里取出后要抹掉", () => {
  it("Hash 路由里的 t 也能取到（深链曾经就丢在这里）", () => {
    const got = extractAgentToken("https://incoruptus.github.io/wulonsmcss/#/join/w1z.abc?t=deadbeef&auto=1");
    expect(got?.token).toBe("deadbeef");
    expect(got?.cleaned).toBe("https://incoruptus.github.io/wulonsmcss/#/join/w1z.abc?auto=1");
  });

  it("普通查询参数照旧支持", () => {
    const got = extractAgentToken("https://incoruptus.github.io/wulonsmcss/?t=abc123#/");
    expect(got?.token).toBe("abc123");
    expect(got?.cleaned).toBe("https://incoruptus.github.io/wulonsmcss/#/");
  });

  it("没有令牌时返回 null，不篡改地址", () => {
    expect(extractAgentToken("https://incoruptus.github.io/wulonsmcss/#/join/abc")).toBeNull();
  });
});
