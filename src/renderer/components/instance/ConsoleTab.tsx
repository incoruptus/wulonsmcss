import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowDownToLine,
  Copy,
  Download,
  Eraser,
  Languages,
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
import { ContextMenu, selectedText } from "@/components/ui/context-menu";
import { useI18n } from "@/i18n";
import { TranslateDialog } from "@/components/ui/translate-dialog";
import { PreflightDialog } from "@/components/instance/PreflightDialog";
import { useServer } from "@/stores/server";
import { useConfig } from "@/stores/config";
import { suggestCommands } from "@/lib/commands";
import { diagnose, type Diagnosis } from "@/lib/crash";
import { buildAiPrompt } from "@/lib/ai-handoff";
import { describeLag } from "@/lib/lag";
import * as worldsApi from "@/lib/worlds";
import { copyText, cx } from "@/lib/utils";
import { pickPath } from "@/lib/path-picker";
import type { Instance } from "@/lib/types";
import type { LogEntry } from "@/lib/api";

const LEVELS = ["INFO", "WARN", "ERROR", "CHAT"] as const;
const LEVEL_STYLE: Record<string, string> = {
  INFO: "text-gray-600",
  WARN: "text-amber-900",
  ERROR: "text-red-900",
  CHAT: "text-blue-900",
};

const QUICK: { cmd: string; label: string; key: string; danger?: boolean }[] = [
  { cmd: "list", label: "在线玩家", key: "console.quick.players" },
  { cmd: "tps", label: "TPS", key: "console.quick.tps" },
  { cmd: "save-all", label: "保存世界", key: "console.quick.save" },
  { cmd: "whitelist list", label: "白名单", key: "console.quick.whitelist" },
  { cmd: "stop", label: "关服", key: "console.quick.stop", danger: true },
];

export function ConsoleTab({ instance }: { instance: Instance }) {
  const { t, locale } = useI18n();
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
  const [translate, setTranslate] = useState<string | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const lagEvents = useServer((s) => s.lagEvents);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function selectAllLogs() {
    const el = listRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // 停服后如果日志里有异常，翻译成人话
  const diagnosis = useMemo(() => {
    if (status !== "stopped" || hideDiag) return null;
    const recent = logs.slice(-150).map((l) => `[${l.level}] ${l.message}${l.stack ? `\n${l.stack}` : ""}`);
    return diagnose(recent);
    // locale 参与依赖：崩溃诊断文案来自 tGlobal，切语言后要重新生成
  }, [status, logs, hideDiag, locale]);

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

  // locale 参与依赖：切语言后补全说明（tGlobal）要重新取词
  const suggestions = useMemo(() => (command.trim() ? suggestCommands(command, players) : []), [command, players, locale]);

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
    if (!ok) toast.warning(t("console.errNotRunning", "服务器未运行，指令未发送"));
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
    const target = await pickPath({
      mode: "save",
      title: t("console.exportLogs.title", "导出日志"),
      defaultPath: `${instance.name}-console-${new Date().toISOString().slice(0, 10)}.log`,
      filters: [{ name: t("console.exportLogs.filterLabel", "日志"), extensions: ["log", "txt"] }],
    });
    if (!target) return;
    const text = filtered.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
    await window.mcss.fs.write(target, text);
    toast.success(t("console.exportLogs.done", "日志已导出"));
  }

  const atBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };

  return (
    <div className="flex h-[calc(100dvh-196px)] min-h-[420px] flex-col gap-3">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-700" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("console.search.placeholder", "搜索日志（支持玩家名 / 错误关键字）")}
            className="h-8 pl-8 pr-8 text-[13px]"
          />
          {query ? (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-700 hover:text-gray-1000"
              onClick={() => setQuery("")}
              aria-label={t("console.search.clear", "清空搜索")}
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
              aria-pressed={levels.has(lv)}
              className={cx(
                "h-6 rounded-full px-2 t-label-12 tabular-nums transition-colors",
                levels.has(lv) ? "bg-gray-200 text-gray-1000" : "text-gray-700 hover:bg-gray-100",
              )}
              title={t("console.levelCount", "{level} · {n} 行", { level: lv, n: counts[lv] ?? 0 })}
            >
              {lv}
              <span className="ml-1 text-gray-600">{counts[lv] ?? 0}</span>
            </button>
          ))}
        </div>

        <IconButton label={t("console.autoScroll", "自动滚动")} size="sm" aria-pressed={autoScroll} onClick={() => setAutoScroll((v) => !v)} className={autoScroll ? "bg-brand-100 text-brand-700" : ""}>
          <ArrowDownToLine className="size-3.5" />
        </IconButton>
        <IconButton
          label={t("console.copyVisible", "复制可见日志")}
          size="sm"
          onClick={async () => {
            const text = filtered.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
            if (!text) return toast.info(t("console.noLogsToCopy", "没有可复制的日志"));
            (await copyText(text)) ? toast.success(t("console.copiedLines", "已复制 {n} 行", { n: filtered.length })) : toast.error(t("console.copyFailed", "复制失败"));
          }}
        >
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton label={t("console.exportLogs.action", "导出日志")} size="sm" onClick={exportLogs}>
          <Download className="size-3.5" />
        </IconButton>
        {lagEvents.length ? (
          <button
            className="mr-1 flex items-center gap-1 rounded-md bg-amber-700/12 px-2 py-1 t-label-12 text-amber-900 hover:bg-amber-700/20"
            onClick={() => setShowLag(true)}
            title={t("console.lag.hint", "服务器 tick 落后时的告警")}
          >
            <Activity className="size-3.5" />
            {t("console.lag.badge", "卡顿 {n}", { n: lagEvents.length })}
            <span className="text-amber-900/70">· {t("console.lag.worst", "最严重 {value}", { value: describeLag(Math.max(...lagEvents.map((e) => e.behindMs))) })}</span>
          </button>
        ) : null}
        <IconButton label={t("console.lag.clear", "清空")} size="sm" onClick={clear}>
          <Eraser className="size-3.5" />
        </IconButton>
      </div>

      {/* 卡顿记录 */}
      <Dialog open={showLag} onOpenChange={setShowLag} widthClass="max-w-xl">
        <DialogHeader
          title={t("console.lag.title", "卡顿记录")}
          desc={t("console.lag.desc", "服务器 tick 落后时输出的 WARN 日志。频繁出现通常意味着 CPU 或内存不足，也可能是某次世界生成卡住导致。")}
        />
        <DialogBody>
          {lagEvents.length === 0 ? (
            <p className="t-label-13 text-gray-700">{t("console.lag.empty", "目前没有卡顿记录。")}</p>
          ) : (
            <div className="max-h-[380px] divide-y divide-gray-300 overflow-y-auto scroll-thin">
              {lagEvents.map((e, i) => (
                <div key={`${e.at}-${i}`} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="t-mono-12 text-gray-800">{new Date(e.at).toLocaleTimeString("zh-CN")}</span>
                    <Badge variant={e.behindMs > 5000 ? "red" : e.behindMs > 2000 ? "amber" : "gray"} size="sm">
                      {t("console.lag.behind", "落后 {value}", { value: describeLag(e.behindMs) })}
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
            {t("console.gotIt", "知道了")}
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
          role="log"
          aria-label={t("console.consoleLogAria", "服务器控制台日志")}
          aria-live="off"
          className="h-full overflow-y-auto rounded-xl bg-background-100 p-4 shadow-geist-border scroll-thin"
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Terminal className="size-5" />}
              title={logs.length ? t("console.empty.noMatchTitle", "没有匹配的日志") : t("console.empty.noneTitle", "还没有输出")}
              desc={
                logs.length
                  ? t("console.empty.noMatchDesc", "可更换关键字，或调整日志级别过滤")
                  : status === "stopped"
                    ? t("console.empty.stoppedDesc", "服务器未运行，启动后日志会在此实时滚动")
                    : t("console.empty.startingDesc", "正在输出，请稍候")
              }
              action={
                logs.length === 0 && status === "stopped" ? (
                  <Button onClick={() => setPreflightOpen(true)}>{t("console.startServer", "启动服务器")}</Button>
                ) : undefined
              }
              className="py-10"
            />
          ) : (
            filtered.map((log) => (
              <LogRow key={log.id} log={log} query={query} onTranslate={setTranslate} onSelectAll={selectAllLogs} />
            ))
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
            {t("console.backToLatest", "回到最新")}
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
            placeholder={status === "running" ? t("console.cmdPlaceholder.running", "输入指令，Tab 补全，回车发送") : t("console.cmdPlaceholder.stopped", "服务器未运行")}
            disabled={status !== "running"}
            className="h-9 font-mono text-[13px]"
          />
          <Button onClick={() => send()} disabled={status !== "running" || !command.trim()}>
            <Send className="size-4" />
            {t("console.send", "发送")}
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
              {t(q.key, q.label)}
              <span className="ml-1 text-gray-600">/{q.cmd}</span>
            </button>
          ))}
          <span className="ml-auto t-label-12 text-gray-700">
            {instance.name} · {t("console.playersOnline", "{n} 人在线", { n: players.length })}
          </span>
        </div>
      </div>

      <Dialog open={confirmStop} onOpenChange={setConfirmStop} widthClass="max-w-md">
        <DialogHeader title={t("console.stopConfirm.title", "确定关闭服务器？")} desc={t("console.stopConfirm.desc", "服务器会先保存世界再退出，在线玩家将被断开连接。")} />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            {t("console.stopConfirm.body", "当前在线 {n} 人。建议先用快捷指令发一条公告，再关服。", { n: players.length })}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmStop(false)}>
            {t("console.cancel", "取消")}
          </Button>
          <Button
            variant="error"
            onClick={async () => {
              setConfirmStop(false);
              await window.mcss.server.command("stop");
              setCommand("");
            }}
          >
            {t("console.stop", "关服")}
          </Button>
        </DialogFooter>
      </Dialog>

      <TranslateDialog open={Boolean(translate)} onOpenChange={(v) => !v && setTranslate(null)} text={translate ?? ""} />
      <PreflightDialog
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        instance={instance}
        onStarted={() => toast.success(t("console.serverStarted", "服务器已启动"))}
      />
    </div>
  );
}

/* ---------------- 单行日志 ---------------- */

function LogRow({
  log,
  query,
  onTranslate,
  onSelectAll,
}: {
  log: LogEntry;
  query: string;
  onTranslate: (text: string) => void;
  onSelectAll: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const hasStack = Boolean(log.stack);
  const line = `[${log.timestamp}] [${log.level}] ${log.message}`;

  const menu = [
    {
      label: t("console.log.copyLine", "复制这一行"),
      icon: Copy,
      onSelect: async () => {
        (await copyText(line)) ? toast.success(t("console.log.copiedLine", "已复制这一行")) : toast.error(t("console.copyFailed", "复制失败"));
      },
    },
    {
      label: t("console.log.copySelection", "复制选中"),
      icon: Copy,
      onSelect: async () => {
        const text = selectedText();
        if (!text) return toast.info(t("console.log.selectFirst", "先选中一段文字"));
        (await copyText(text)) ? toast.success(t("console.log.copied", "已复制")) : toast.error(t("console.copyFailed", "复制失败"));
      },
    },
    { label: t("console.log.selectAll", "全选日志"), icon: Terminal, onSelect: onSelectAll },
    { separator: true, label: "" },
    {
      label: t("console.log.translateLine", "翻译这一行"),
      icon: Languages,
      onSelect: () => onTranslate(log.message),
    },
    {
      label: t("console.log.translateSelection", "翻译选中"),
      icon: Languages,
      onSelect: () => {
        const text = selectedText();
        if (!text) return toast.info(t("console.log.selectFirst", "先选中一段文字"));
        onTranslate(text);
      },
    },
  ];

  return (
    <ContextMenu items={menu}>
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
            {open ? t("console.log.collapseStack", "收起堆栈") : t("console.log.expandStack", "堆栈 ({n})", { n: log.stack!.split("\n").length })}
          </button>
        ) : null}
        {open && hasStack ? (
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background-200 p-2 text-[11.5px] leading-5 text-gray-900 scroll-thin">
            {log.stack}
          </pre>
        ) : null}
      </div>
      <button
        className="hidden shrink-0 text-gray-600 group-hover:block group-focus-within:block hover:text-gray-1000 focus-visible:block"
        onClick={async () => {
          await copyText(`[${log.timestamp}] [${log.level}] ${log.message}`);
          toast.success(t("console.log.copiedLine", "已复制这一行"));
        }}
        aria-label={t("console.log.copyLine", "复制这一行")}
      >
        <Copy className="size-3" />
      </button>
      </div>
    </ContextMenu>
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
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const updateInstance = useConfig((s) => s.updateInstance);

  async function run(action: Diagnosis["actions"][number]) {
    if (action.kind === "none") return;
    setBusy(true);
    try {
      if (action.kind === "disable-mod" && action.arg) {
        const list = await window.mcss.mods.scan(`${instance.dir}\\mods`);
        const target = list.find((m) => m.id === action.arg) ?? list.find((m) => m.file.includes(action.arg!));
        if (!target) {
          toast.error(t("diagnosis.modNotFound", "未找到 {name} 的 jar，可在模组页面手动关闭", { name: action.arg }));
          return;
        }
        await window.mcss.mods.disable(target.path);
        toast.success(t("diagnosis.modDisabled", "已禁用 {name}，可重新启动验证", { name: target.name }));
        onDismiss();
      } else if (action.kind === "repair-datapacks") {
        const res = await worldsApi.repair(instance.dir);
        if (!res.success) throw new Error(res.error || t("diagnosis.repairFailed", "修复失败"));
        toast.success(t("diagnosis.repaired", "已修复 {n} 处，可重新启动验证", { n: res.fixed?.length ?? 0 }));
        onDismiss();
      } else if (action.kind === "change-java") {
        const picked = await window.mcss.app.pickJava();
        if (picked) {
          await updateInstance(instance.id, { javaPath: picked });
          toast.success(t("diagnosis.javaChanged", "Java 已更换"), { description: t("diagnosis.javaChangedDesc", "现在可以重新启动服务器。") });
          onDismiss();
        }
      } else {
        toast.info(t("diagnosis.tweakSettings", "去「服务器设置」里改一下就好"));
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
          <div className="t-label-13 font-medium text-red-900">{t("diagnosis.failedTitle", "服务器没能起来：{title}", { title: diagnosis.title })}</div>
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
                (await copyText(prompt)) ? toast.success(t("diagnosis.copiedBundle", "已复制故障诊断包，可粘贴给任意 AI 工具")) : toast.error(t("console.copyFailed", "复制失败"));
              }}
            >
              {t("diagnosis.askAi", "让 AI 看看")}
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={async () => {
                const info = await window.mcss.app.info();
                const dir = `${info.documents}\\MCSS\\现场包`;
                const file = `${dir}\\${instance.name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.zip`;
                try {
                  const res = await window.mcss.ai.exportBundle({
                    outFile: file,
                    instanceId: instance.id,
                    logs: useServer.getState().logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}${l.stack ? `\n${l.stack}` : ""}`),
                    symptom: { title: diagnosis.title, detail: diagnosis.detail },
                  });
                  if (!res.ok) throw new Error(res.error || t("diagnosis.exportFailed", "导出失败"));
                  void window.mcss.app.openPath(dir);
                  toast.success(t("diagnosis.bundleExported", "现场包已导出"), { description: t("diagnosis.bundleExportedDesc", "可将该文件交给任意 AI 工具继续排查") });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {t("diagnosis.exportBundle", "导出现场包")}
            </Button>
            <Button size="xs" variant="ghost" onClick={onDismiss}>
              {t("console.gotIt", "知道了")}
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
