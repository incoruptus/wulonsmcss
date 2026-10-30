import { describe, expect, it } from "vitest";
import { isLoopbackUrl } from "./shell";

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
