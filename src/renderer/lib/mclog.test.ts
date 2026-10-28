import { describe, expect, it } from "vitest";
import { isStackTraceLine, parseLogLine, stripAnsi } from "./mclog";
import { suggestCommands } from "./commands";

describe("日志解析", () => {
  it("拆出时间、线程、级别与正文", () => {
    const p = parseLogLine('[12:34:56] [Server thread/INFO]: Done (3.2s)! For help, type "help"');
    expect(p.time).toBe("12:34:56");
    expect(p.thread).toBe("Server thread");
    expect(p.level).toBe("INFO");
    expect(p.message).toBe('Done (3.2s)! For help, type "help"');
  });

  it("识别 WARN / ERROR", () => {
    expect(parseLogLine("[01:00:00] [Server thread/WARN]: Can't keep up!").level).toBe("WARN");
    expect(parseLogLine("[01:00:00] [Server thread/ERROR]: Encountered an unexpected exception").level).toBe("ERROR");
  });

  it("聊天行变成 CHAT 并带发言人", () => {
    const p = parseLogLine("[12:00:00] [Async Chat Thread - #0/INFO]: <Steve> 有人在吗");
    expect(p.level).toBe("CHAT");
    expect(p.chatFrom).toBe("Steve");
    expect(p.message).toBe("有人在吗");
  });

  it("兼容 [Not Secure] 前缀", () => {
    expect(parseLogLine("[12:00:00] [Server thread/INFO]: [Not Secure] <Alex> hi").chatFrom).toBe("Alex");
  });

  it("无前缀的行按内容猜级别", () => {
    expect(parseLogLine("java.lang.NullPointerException: null").level).toBe("ERROR");
    expect(parseLogLine("[WARN] something").level).toBe("WARN");
    expect(parseLogLine("hello").level).toBe("INFO");
  });

  it("去掉 ANSI 颜色", () => {
    expect(stripAnsi("\u001b[1;34mhello\u001b[0m")).toBe("hello");
  });

  it("堆栈续行识别", () => {
    expect(isStackTraceLine("\tat net.minecraft.Foo.bar(Foo.java:12)")).toBe(true);
    expect(isStackTraceLine("Caused by: java.lang.IllegalStateException")).toBe(true);
    expect(isStackTraceLine("Done (3.2s)!")).toBe(false);
  });
});

describe("指令补全", () => {
  const players = ["Steve", "Alex"];

  it("按前缀补全指令名并带说明", () => {
    const list = suggestCommands("whi", players);
    expect(list[0].label.startsWith("whitelist")).toBe(true);
    expect(list[0].hint).toContain("白名单");
  });

  it("玩家参数补全", () => {
    const list = suggestCommands("op al", players);
    expect(list[0].label).toBe("Alex");
  });

  it("枚举参数补全", () => {
    const list = suggestCommands("gamemode c", players);
    expect(list[0].label).toBe("creative");
    expect(list[0].value).toBe("gamemode creative ");
  });

  it("没有匹配时返回空", () => {
    expect(suggestCommands("zzz", players)).toHaveLength(0);
    expect(suggestCommands("", players)).toHaveLength(0);
  });
});
