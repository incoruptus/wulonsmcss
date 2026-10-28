import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowDownToLine,
  Copy,
  Download,
  Eraser,
  Search,
  Send,
  Stethoscope,
  Terminal,
  X,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { useServer } from "@/stores/server";
import { suggestCommands } from "@/lib/commands";
import { diagnose, type Diagnosis } from "@/lib/crash";
import { buildAiPrompt } from "@/lib/ai-handoff";
import { describeLag } from "@/lib/lag";
import { copyText, cx } from "@/lib/utils";
import type { Instance } from "@/lib/types";
import type { LogEntry } from "@/lib/api";

const LEVELS = ["INFO", "WARN", "ERROR", "CHAT"] as const;
const LEVEL_STYLE: Record<string, string> = {
  INFO: "text-gray-600",
  WARN: "text-amber-900",
  ERROR: "text-red-900",
  CHAT: "text-blue-900",
};

const QUICK: { cmd: string; label: string; danger?: boolean }[] = [
  { cmd: "list", label: "在线玩家" },
  { cmd: "tps", label: "TPS" },
  { cmd: "save-all", label: "保存世界" },
  { cmd: "whitelist list", label: "白名单" },
  { cmd: "stop", label: "关服", danger: true },
];

export function ConsoleTab({ instance }: { instance: Instance }) {
  const logs = useServer((s) => s.logs);
  const clear = useServer((s) => s.clear);
  const status = useServer((s) => s.status);
  const players = useServer((s) => s.players);

  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Set<string>>(new Set(LEVELS));
  const [autoScroll, setAutoScroll] = useState(true);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  const [hideDiag, setHideDiag] = useState(false);
  const [showLag, setShowLag] = useState(false);
  const lagEvents = useServer((s) => s.lagEvents);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 停服后如果日志里有异常，翻译成人话
  const diagnosis = useMemo(() => {
    if (status !== "stopped" || hideDiag) return null;
    const recent = logs.slice(-150).map((l) => `[${l.level}] ${l.message}${l.stack ? `\n${l.stack}` : ""}`);
    return diagnose(recent);
  }, [status, logs, hideDiag]);

  useEffect(() => {
    if (status === "running") setHideDiag(false);
  }, [status]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { INFO: 0, WARN: 0, ERROR: 0, CHAT: 0 };
    for (const l of logs) map[l.level] = (map[l.level] ?? 0) + 1;
    return map;
  }, [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => levels.has(l.level) && (!q || l.message.toLowerCase().includes(q)));
  }, [logs, query, levels]);

  const suggestions = useMemo(() => (command.trim() ? suggestCommands(command, players) : []), [command, players]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoScroll]);

  useEffect(() => setSuggestIdx(0), [command]);

  async function send(cmd?: string) {
    const text = (cmd ?? command).trim();
    if (!text) return;
    if (text === "stop") {
      setConfirmStop(true);
      return;
    }
    // 多行粘贴：逐条发送
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let ok = true;
    for (const line of lines) {
      ok = (await window.mcss.server.command(line).catch(() => false)) && ok;
    }
    if (!ok) toast.warning("服务器没在运行，指令没有发出去");
    setHistory((h) => [...h.filter((x) => x !== text), text].slice(-50));
    setHistoryIdx(-1);
    setCommand("");
  }

  function applySuggestion(value: string) {
    setCommand(value);
    inputRef.current?.focus();
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

  async function exportLogs() {
    const target = await window.mcss.dialog.saveFile({
      defaultPath: `${instance.name}-console-${new Date().toISOString().slice(0, 10)}.log`,
      filters: [{ name: "日志", extensions: ["log", "txt"] }],
    });
    if (!target) return;
    const text = filtered.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
    await window.mcss.fs.write(target, text);
    toast.success("日志已导出");
  }

  const atBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };

  return (
    <div className="flex h-[calc(100dvh-232px)] min-h-[360px] flex-col gap-2">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索日志（支持玩家名 / 错误关键字）"
            className="h-8 pl-8 pr-8 text-[13px]"
          />
          {query ? (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-1000"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => toggleLevel(lv)}
              className={cx(
                "h-6 rounded-full px-2 t-label-12 tabular-nums transition-colors",
                levels.has(lv) ? "bg-gray-200 text-gray-1000" : "text-gray-700 hover:bg-gray-100",
              )}
              title={`${lv} · ${counts[lv] ?? 0} 行`}
            >
              {lv}
              <span className="ml-1 text-gray-600">{counts[lv] ?? 0}</span>
            </button>
          ))}
        </div>

        <IconButton label="自动滚动" size="sm" onClick={() => setAutoScroll((v) => !v)} className={autoScroll ? "text-blue-800" : ""}>
          <ArrowDownToLine className="size-3.5" />
        </IconButton>
        <IconButton
          label="复制可见日志"
          size="sm"
          onClick={async () => {
            const text = filtered.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
            if (!text) return toast.info("没有可复制的日志");
            (await copyText(text)) ? toast.success(`已复制 ${filtered.length} 行`) : toast.error("复制失败");
          }}
        >
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton label="导出日志" size="sm" onClick={exportLogs}>
          <Download className="size-3.5" />
        </IconButton>
        {lagEvents.length ? (
          <button
            className="mr-1 flex items-center gap-1 rounded-md bg-amber-700/12 px-2 py-1 t-label-12 text-amber-900 hover:bg-amber-700/20"
            onClick={() => setShowLag(true)}
            title="服务器 tick 落后时的告警"
          >
            <Activity className="size-3.5" />
            卡顿 {lagEvents.length}
            <span className="text-amber-900/70">· 最严重 {describeLag(Math.max(...lagEvents.map((e) => e.behindMs)))}</span>
          </button>
        ) : null}
        <IconButton label="清空" size="sm" onClick={clear}>
          <Eraser className="size-3.5" />
        </IconButton>
      </div>

      {/* 卡顿记录 */}
      <Dialog open={showLag} onOpenChange={setShowLag} widthClass="max-w-xl">
        <DialogHeader
          title="卡顿记录"
          desc="服务器 tick 落后时打的 WARN。频繁出现说明 CPU 跟不上、内存吃紧，或某次世界生成卡住了。"
        />
        <DialogBody>
          {lagEvents.length === 0 ? (
            <p className="t-label-13 text-gray-700">目前没有卡顿记录。</p>
          ) : (
            <div className="max-h-[380px] divide-y divide-gray-300 overflow-y-auto scroll-thin">
              {lagEvents.map((e, i) => (
                <div key={`${e.at}-${i}`} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="t-mono-12 text-gray-800">{new Date(e.at).toLocaleTimeString("zh-CN")}</span>
                    <Badge variant={e.behindMs > 5000 ? "red" : e.behindMs > 2000 ? "amber" : "gray"} size="sm">
                      落后 {describeLag(e.behindMs)}
                    </Badge>
                    {e.ticks ? <span className="t-label-12 text-gray-700">{e.ticks} ticks</span> : null}
                  </div>
                  <div className="t-mono-12 mt-0.5 break-all text-gray-700">{e.message}</div>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setShowLag(false)}>
            知道了
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 崩溃诊断 */}
      {diagnosis ? (
        <DiagnosisCard
          diagnosis={diagnosis}
          instance={instance}
          onDismiss={() => setHideDiag(true)}
        />
      ) : null}

      {/* 日志区 */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={() => {
            if (!atBottom()) setAutoScroll(false);
            else setAutoScroll(true);
          }}
          className="h-full overflow-y-auto rounded-xl bg-background-100 p-3 shadow-geist-border scroll-thin"
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Terminal className="size-5" />}
              title={logs.length ? "没有匹配的日志" : "还没有输出"}
              desc={
                logs.length
                  ? "换个关键字，或把过滤的级别打开"
                  : status === "stopped"
                    ? "服务器没在运行，启动后这里会实时滚动"
                    : "稍等一下，正在输出"
              }
              action={
                logs.length === 0 && status === "stopped" ? (
                  <Button
                    onClick={async () => {
                      const res = await window.mcss.server.start(instance.id);
                      if (!res.ok) toast.error(res.error || "启动失败");
                    }}
                  >
                    启动服务器
                  </Button>
                ) : undefined
              }
              className="py-10"
            />
          ) : (
            filtered.map((log) => <LogRow key={log.id} log={log} query={query} />)
          )}
        </div>

        {!autoScroll ? (
          <button
            onClick={() => {
              setAutoScroll(true);
              const el = listRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-1000 px-3 py-1 t-label-12 text-background-100 shadow-geist-lg"
          >
            回到最新
          </button>
        ) : null}
      </div>

      {/* 输入区 */}
      <div className="relative">
        {suggestions.length > 0 ? (
          <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-lg bg-background-100 shadow-geist-menu">
            {suggestions.map((s, i) => (
              <button
                key={s.label + i}
                className={cx(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
                  i === suggestIdx ? "bg-gray-100" : "hover:bg-gray-100",
                )}
                onMouseEnter={() => setSuggestIdx(i)}
                onClick={() => applySuggestion(s.value)}
              >
                <span className="t-mono-12 text-gray-1000">{s.label}</span>
                {s.hint ? <span className="t-label-12 truncate text-gray-700">{s.hint}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                if (suggestions[suggestIdx]) applySuggestion(suggestions[suggestIdx].value);
                return;
              }
              if (e.key === "ArrowDown" && suggestions.length) {
                e.preventDefault();
                setSuggestIdx((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp" && suggestions.length) {
                e.preventDefault();
                setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
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
            placeholder={status === "running" ? "输入指令，Tab 补全，回车发送" : "服务器未运行"}
            disabled={status !== "running"}
            className="h-9 font-mono text-[13px]"
          />
          <Button onClick={() => send()} disabled={status !== "running" || !command.trim()}>
            <Send className="size-4" />
            发送
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q.cmd}
              disabled={status !== "running"}
              onClick={() => send(q.cmd)}
              className={cx(
                "h-6 rounded-full px-2.5 t-label-12 transition-colors disabled:opacity-40",
                q.danger ? "text-red-900 hover:bg-red-700/10" : "text-gray-800 hover:bg-gray-100",
              )}
            >
              {q.label}
              <span className="ml-1 text-gray-600">/{q.cmd}</span>
            </button>
          ))}
          <span className="ml-auto t-label-12 text-gray-700">
            {instance.name} · {players.length} 人在线
          </span>
        </div>
      </div>

      <Dialog open={confirmStop} onOpenChange={setConfirmStop} widthClass="max-w-md">
        <DialogHeader title="确定关闭服务器？" desc="会先保存世界再退出，在线玩家会被断开。" />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            当前在线 {players.length} 人。建议先用快捷指令发一条公告，再关服。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmStop(false)}>
            取消
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              setConfirmStop(false);
              await window.mcss.server.command("stop");
              setCommand("");
            }}
          >
            关服
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/* ---------------- 单行日志 ---------------- */

function LogRow({ log, query }: { log: LogEntry; query: string }) {
  const [open, setOpen] = useState(false);
  const hasStack = Boolean(log.stack);

  return (
    <div className="group flex gap-2 py-[1px]" style={{ contentVisibility: "auto", containIntrinsicSize: "0 20px" }}>
      <span className="w-[62px] shrink-0 select-none text-[12px] tabular-nums text-gray-600">{log.timestamp}</span>
      <span className={cx("w-[42px] shrink-0 select-none text-[12px]", LEVEL_STYLE[log.level] ?? "text-gray-600")}>
        {log.level === "CHAT" ? "CHAT" : log.level}
      </span>
      {log.thread && log.thread !== "Server thread" ? (
        <span className="hidden w-[120px] shrink-0 truncate text-[11px] text-gray-600 lg:block">{log.thread}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <span
          className={cx(
            "whitespace-pre-wrap break-words text-[12.5px]",
            log.level === "ERROR"
              ? "text-red-900"
              : log.level === "WARN"
                ? "text-amber-900"
                : log.level === "CHAT"
                  ? "text-blue-900"
                  : "text-gray-1000",
          )}
        >
          {log.level === "CHAT" && log.chatFrom ? (
            <span className="mr-1 font-medium text-blue-900">{log.chatFrom}:</span>
          ) : null}
          <Highlight text={log.message} query={query} />
        </span>
        {hasStack ? (
          <button
            className="ml-2 align-baseline text-[11px] text-gray-600 underline underline-offset-2 hover:text-gray-1000"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起堆栈" : `堆栈 (${log.stack!.split("\n").length})`}
          </button>
        ) : null}
        {open && hasStack ? (
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background-200 p-2 text-[11.5px] leading-5 text-gray-900 scroll-thin">
            {log.stack}
          </pre>
        ) : null}
      </div>
      <button
        className="hidden shrink-0 text-gray-600 group-hover:block hover:text-gray-1000"
        onClick={async () => {
          await copyText(`[${log.timestamp}] [${log.level}] ${log.message}`);
          toast.success("已复制这一行");
        }}
        aria-label="复制这一行"
      >
        <Copy className="size-3" />
      </button>
    </div>
  );
}

/* ---------------- 崩溃诊断卡 ---------------- */

function DiagnosisCard({
  diagnosis,
  instance,
  onDismiss,
}: {
  diagnosis: Diagnosis;
  instance: Instance;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: Diagnosis["actions"][number]) {
    if (action.kind === "none") return;
    setBusy(true);
    try {
      if (action.kind === "disable-mod" && action.arg) {
        const list = await window.mcss.mods.scan(`${instance.dir}\\mods`);
        const target = list.find((m) => m.id === action.arg) ?? list.find((m) => m.file.includes(action.arg!));
        if (!target) {
          toast.error(`没找到 ${action.arg} 的 jar，去 Mod 页手动关掉吧`);
          return;
        }
        await window.mcss.mods.disable(target.path);
        toast.success(`已禁用 ${target.name}，再启动试试`);
        onDismiss();
      } else if (action.kind === "repair-datapacks") {
        const res = await window.mcss.worlds.repair(instance.dir);
        if (!res.success) throw new Error(res.error || "修复失败");
        toast.success(`已修复 ${res.fixed?.length ?? 0} 处，再启动试试`);
        onDismiss();
      } else if (action.kind === "change-java") {
        const picked = await window.mcss.app.pickJava();
        if (picked) toast.success("Java 已选中，保存到实例设置后再启动");
      } else {
        toast.info("去「实例设置」里改一下就好");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-red-700/10 p-3">
      <div className="flex items-start gap-2">
        <Stethoscope className="mt-0.5 size-4 shrink-0 text-red-900" />
        <div className="min-w-0 flex-1">
          <div className="t-label-13 font-medium text-red-900">服务器没能起来：{diagnosis.title}</div>
          <div className="t-label-12 mt-0.5 text-gray-800">{diagnosis.detail}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {diagnosis.actions.map((a) => (
              <Button key={a.label} size="xs" variant="secondary" onClick={() => run(a)} loading={busy}>
                {a.label}
              </Button>
            ))}
            <Button
              size="xs"
              variant="secondary"
              onClick={async () => {
                const docsPath = await window.mcss.app.aiDocs().catch(() => "");
                const prompt = buildAiPrompt({
                  instance,
                  symptom: { title: diagnosis.title, detail: diagnosis.detail },
                  logs: useServer.getState().logs.map((l) => `[${l.level}] ${l.message}${l.stack ? `\n${l.stack}` : ""}`),
                  docsPath,
                });
                (await copyText(prompt)) ? toast.success("已复制排错包，粘给任意 AI 即可") : toast.error("复制失败");
              }}
            >
              让 AI 看看
            </Button>
            <Button size="xs" variant="ghost" onClick={onDismiss}>
              知道了
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-700/30 px-0.5 text-gray-1000">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
