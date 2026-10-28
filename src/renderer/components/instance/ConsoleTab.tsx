import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Copy, Send, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/misc";
import { useServer } from "@/stores/server";
import { copyText, cx } from "@/lib/utils";
import type { Instance } from "@/lib/types";

const LEVELS = ["INFO", "WARN", "ERROR"] as const;

export function ConsoleTab({ instance }: { instance: Instance }) {
  const logs = useServer((s) => s.logs);
  const clear = useServer((s) => s.clear);
  const status = useServer((s) => s.status);

  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Set<string>>(new Set(LEVELS));
  const [autoScroll, setAutoScroll] = useState(true);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => levels.has(l.level) && (!q || l.message.toLowerCase().includes(q)));
  }, [logs, query, levels]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoScroll]);

  async function send() {
    const cmd = command.trim();
    if (!cmd) return;
    const ok = await window.mcss.server.command(cmd).catch(() => false);
    if (!ok) toast.warning("服务器没在运行，指令没有发出去");
    setHistory((h) => [...h.filter((x) => x !== cmd), cmd].slice(-50));
    setHistoryIdx(-1);
    setCommand("");
  }

  function toggleLevel(level: string) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        if (next.size > 1) next.delete(level);
      } else next.add(level);
      return next;
    });
  }

  return (
    <div className="flex h-[calc(100dvh-220px)] min-h-[380px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索日志…"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => toggleLevel(lv)}
              className={cx(
                "h-6 rounded-full px-2.5 t-label-12 transition-colors",
                levels.has(lv) ? "bg-gray-200 text-gray-1000" : "text-gray-700 hover:bg-gray-100",
              )}
            >
              {lv}
            </button>
          ))}
        </div>
        <IconButton label={autoScroll ? "关闭自动滚动" : "开启自动滚动"} size="sm" onClick={() => setAutoScroll((v) => !v)} className={autoScroll ? "text-blue-800" : ""}>
          <ArrowDownToLine className="size-3.5" />
        </IconButton>
        <IconButton label="清空日志" size="sm" onClick={clear}>
          <Trash2 className="size-3.5" />
        </IconButton>
        <Badge variant="gray" size="sm">
          {filtered.length} / {logs.length}
        </Badge>
      </div>

      <div
        ref={listRef}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight > 40) setAutoScroll(false);
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 4) setAutoScroll(true);
        }}
        className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-background-100 p-3 font-mono shadow-geist-border scroll-thin"
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="没有日志"
            desc={status === "stopped" ? "服务器还没启动，点右上角「启动」" : "还没有输出，稍等一下"}
            className="py-10"
          />
        ) : (
          filtered.map((log) => (
            <div key={log.id} className="group flex gap-2 py-[1px]">
              <span className="shrink-0 select-none text-[12px] text-gray-600">{log.timestamp}</span>
              <span
                className={cx(
                  "shrink-0 text-[12px]",
                  log.level === "ERROR" ? "text-red-900" : log.level === "WARN" ? "text-amber-900" : "text-gray-600",
                )}
              >
                {log.level}
              </span>
              <span
                className={cx(
                  "min-w-0 whitespace-pre-wrap break-words text-[12.5px]",
                  log.level === "ERROR" ? "text-red-900" : log.level === "WARN" ? "text-amber-900" : "text-gray-1000",
                )}
              >
                {log.message}
              </span>
              <button
                className="ml-auto hidden shrink-0 text-gray-600 group-hover:block hover:text-gray-1000"
                onClick={async () => {
                  await copyText(`[${log.timestamp}] [${log.level}] ${log.message}`);
                  toast.success("已复制这一行");
                }}
                aria-label="复制这一行"
              >
                <Copy className="size-3" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHistoryIdx((i) => {
                const next = Math.min(i + 1, history.length - 1);
                if (next >= 0) setCommand(history[history.length - 1 - next] ?? "");
                return next;
              });
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setHistoryIdx((i) => {
                const next = Math.max(i - 1, -1);
                setCommand(next < 0 ? "" : (history[history.length - 1 - next] ?? ""));
                return next;
              });
            }
          }}
          placeholder={status === "running" ? "输入指令，回车发送（↑↓ 翻历史）" : "服务器未运行"}
          disabled={status !== "running"}
          className="h-9 font-mono text-[13px]"
        />
        <Button onClick={send} disabled={status !== "running" || !command.trim()}>
          <Send className="size-4" />
          发送
        </Button>
      </div>
      <p className="t-label-12 text-gray-700">
        {instance.name} · 指令会直接写入服务器 stdin
      </p>
    </div>
  );
}
