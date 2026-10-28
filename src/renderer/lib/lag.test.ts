import { describe, expect, it } from "vitest";
import { describeLag, parseLag } from "./lag";

const LINE =
  "[06:11:22] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 3034ms or 60 ticks behind";

describe("卡顿识别", () => {
  it("识别标准告警", () => {
    const e = parseLag(LINE);
    expect(e).not.toBeNull();
    expect(e!.behindMs).toBe(3034);
    expect(e!.ticks).toBe(60);
  });

  it("没有 ticks 也能识别", () => {
    const e = parseLag("Can't keep up! Is the server overloaded? Running 1200ms behind");
    expect(e!.behindMs).toBe(1200);
    expect(e!.ticks).toBeUndefined();
  });

  it("旧版 skipping tick 形式", () => {
    const e = parseLag("Can't keep up! Did the system time change, or is the server overloaded? Running 5000ms behind, skipping 100 tick(s)");
    expect(e!.behindMs).toBe(5000);
  });

  it("普通日志不误判", () => {
    expect(parseLag("Done (2.013s)! For help, type \"help\"")).toBeNull();
    expect(parseLag("Player Steve joined the game")).toBeNull();
  });

  it("人话描述", () => {
    expect(describeLag(450)).toBe("450 毫秒");
    expect(describeLag(3034)).toBe("3.0 秒");
  });
});
