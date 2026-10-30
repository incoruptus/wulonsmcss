import { beforeEach, describe, expect, it } from "vitest";
import { useServer } from "./server";

const LAG = "[06:11:22] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 3034ms or 60 ticks behind";

describe("开服就绪信号", () => {
  it("Done 之后 ready 才为 true，停服就清零", () => {
    useServer.getState().setStatus("starting");
    useServer.getState().setStatus("running");
    expect(useServer.getState().ready).toBe(false);

    useServer.getState().addLog({ timestamp: "06:11:22", level: "INFO", message: 'Done (3.456s)! For help, type "help"' });
    expect(useServer.getState().ready).toBe(true);

    useServer.getState().setStatus("stopping");
    expect(useServer.getState().ready).toBe(false);
  });
});

describe("卡顿事件入栈", () => {
  beforeEach(() => {
    useServer.getState().clear();
  });

  it("识别卡顿并记录", () => {
    useServer.getState().addLog({ timestamp: "06:11:22", level: "WARN", message: LAG });
    const events = useServer.getState().lagEvents;
    expect(events).toHaveLength(1);
    expect(events[0].behindMs).toBe(3034);
    expect(events[0].ticks).toBe(60);
  });

  it("5 秒内连刷只记一条", () => {
    const s = useServer.getState();
    s.addLog({ timestamp: "06:11:22", level: "WARN", message: LAG });
    s.addLog({ timestamp: "06:11:23", level: "WARN", message: LAG });
    expect(useServer.getState().lagEvents).toHaveLength(1);
  });

  it("普通日志不会产生卡顿记录", () => {
    useServer.getState().addLog({ timestamp: "06:11:22", level: "INFO", message: "Done (2.013s)! For help, type \"help\"" });
    expect(useServer.getState().lagEvents).toHaveLength(0);
  });

  it("清空日志同时清空卡顿记录", () => {
    useServer.getState().addLog({ timestamp: "06:11:22", level: "WARN", message: LAG });
    useServer.getState().clear();
    expect(useServer.getState().lagEvents).toHaveLength(0);
  });
});
