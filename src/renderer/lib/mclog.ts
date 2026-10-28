/**
 * Minecraft 服务端日志解析
 * 原始行形如：`[12:34:56] [Server thread/INFO]: Done (3.2s)! For help, type "help"`
 * 变体：`[12:34:56] [Server thread/WARN]: ...`、`[12:34:56] [Async Chat Thread - #0/INFO]: <Steve> hi`
 * 无前缀（部分 Mod / 启动器输出）也要能兜住。
 */

export type LogLevel = "INFO" | "WARN" | "ERROR" | "CHAT";

export interface ParsedLog {
  level: LogLevel;
  message: string;
  /** 服务端自己的时间戳（HH:mm:ss） */
  time?: string;
  /** 线程名 */
  thread?: string;
  /** 聊天发言人 */
  chatFrom?: string;
}

const ANSI = /\u001b\[[0-9;]*m/g;
// [时间] [线程/级别]: 内容
const PREFIX = /^\[(\d{2}:\d{2}:\d{2})\]\s\[([^\]]+)\]:\s?([\s\S]*)$/;
// 只有 [线程/级别]: 内容（某些版本的时间在别处）
const PREFIX_NO_TIME = /^\[([^\]]+)\]:\s?([\s\S]*)$/;
const CHAT = /^(?:\[Not Secure\]\s*)?<([^>]{1,32})>\s?([\s\S]*)$/;

function levelOf(raw: string): LogLevel | null {
  const s = raw.toUpperCase();
  if (s === "INFO" || s === "WARN" || s === "ERROR" || s === "CHAT") return s as LogLevel;
  if (s.includes("/")) {
    const tail = s.split("/").pop();
    if (tail === "INFO" || tail === "WARN" || tail === "ERROR") return tail as LogLevel;
  }
  return null;
}

export function stripAnsi(text: string): string {
  return String(text).replace(ANSI, "");
}

export function parseLogLine(rawLine: string): ParsedLog {
  const line = stripAnsi(rawLine).replace(/\r$/, "");

  let time: string | undefined;
  let thread: string | undefined;
  let body = line;
  let level: LogLevel | null = null;

  const m = line.match(PREFIX);
  if (m) {
    time = m[1];
    const tag = m[2];
    body = m[3];
    const slash = tag.lastIndexOf("/");
    thread = slash > 0 ? tag.slice(0, slash) : undefined;
    level = levelOf(slash > 0 ? tag.slice(slash + 1) : tag);
  } else {
    const m2 = line.match(PREFIX_NO_TIME);
    if (m2) {
      const tag = m2[1];
      body = m2[2];
      const slash = tag.lastIndexOf("/");
      if (slash > 0) {
        thread = tag.slice(0, slash);
        level = levelOf(tag.slice(slash + 1));
      }
    }
  }

  // 聊天：<Steve> 内容
  const chat = body.match(CHAT);
  if (chat && (level === null || level === "INFO")) {
    return { level: "CHAT", message: chat[2], time, thread, chatFrom: chat[1] };
  }

  // 没有可识别级别时按内容猜
  if (!level) {
    if (/Exception|Error|FATAL|Caused by:/.test(body)) level = "ERROR";
    else if (/WARN(ING)?\b/.test(body)) level = "WARN";
    else level = "INFO";
  }

  return { level, message: body, time, thread };
}

/** 这一行是否是上一条错误的堆栈续行 */
export function isStackTraceLine(line: string): boolean {
  const t = stripAnsi(line).trim();
  if (!t) return false;
  return (
    /^at\s+[\w.$]+\(/.test(t) ||
    /^Caused by:/.test(t) ||
    /^\.{3}\s+\d+\s+more/.test(t) ||
    /^Suppressed:/.test(t) ||
    /^\s+at\s+/.test(line)
  );
}

/** 从 chat 行里拿玩家名（用于在线列表兜底） */
export function chatPlayer(parsed: ParsedLog): string | null {
  return parsed.level === "CHAT" ? (parsed.chatFrom ?? null) : null;
}
