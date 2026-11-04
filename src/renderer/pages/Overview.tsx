import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Clock, Terminal, FolderOpen, Gauge, Link2, Play, Plus, RefreshCw, Save, Server,
  Settings2, Square, Zap, Users, Cpu, Network, ScrollText, ArrowUpRight,
} from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Progress, SegmentedControl } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { formatBytes, formatDuration, formatDateTime } from "@/lib/utils";
import { clientRequirementOf, contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { useI18n } from "@/i18n";
import { describeLag } from "@/lib/lag";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { PreflightDialog } from "@/components/instance/PreflightDialog";
import { InviteDialog } from "@/components/instance/InviteDialog";
import { ReachabilityPanel } from "@/components/instance/ReachabilityPanel";
import { StopServerDialog } from "@/components/instance/StopServerDialog";

export default function Overview() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const logs = useServer((s) => s.logs);
  const players = useServer((s) => s.players);
  const memoryUsed = useServer((s) => s.memoryUsed);
  const setMemory = useServer((s) => s.setMemory);
  const updateInstance = useConfig((s) => s.updateInstance);
  const lagEvents = useServer((s) => s.lagEvents);
  const tps = useServer((s) => s.tps);
  const [creating, setCreating] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const active = useMemo(() => instances.find((i) => i.id === activeId) ?? instances[0], [instances, activeId]);
  const running = status === "running" || status === "starting";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      const bytes = await window.mcss.server.memory().catch(() => 0);
      if (bytes > 0) setMemory(bytes);
    };
    void tick();
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [running, setMemory]);

  async function toggle() {
    if (!active) return;
    if (running) setStopOpen(true);
    else setPreflightOpen(true);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  }

  if (!active) {
    return (
      <>
        <PageHeader title={t("overview.empty.title", "从第一台服务器开始")} desc={t("overview.empty.desc", "无需提前研究参数，选好版本后，开服茶会逐步引导完成配置。")} />
        <PageBody>
          <Card className="panel-wash">
            <EmptyState
              icon={<Server className="size-5" />}
              title={t("overview.empty.stateTitle", "还没有服务器")}
              desc={t("overview.empty.stateDesc", "先建一个服务器，朋友才能进来。版本、模组和内存都可以用推荐值，之后再改。")}
              action={<Button size="lg" variant="accent" onClick={() => setCreating(true)}><Plus className="size-4" />{t("pages.common.newServer", "新建服务器")}</Button>}
            />
          </Card>
          <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
        </PageBody>
      </>
    );
  }

  const serverType = serverTypeOf(active);
  const lifecycle = active.lifecycle ?? "persistent";
  const uptime = running && startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const memMaxBytes = Math.max(1, active.memoryMax) * 1024 ** 3;
  const memPct = memoryUsed ? Math.min(100, Math.round((memoryUsed / memMaxBytes) * 100)) : 0;
  const statusLabel =
    status === "running"
      ? t("pages.common.status.running", "运行中")
      : status === "starting"
        ? t("pages.common.status.starting", "启动中")
        : status === "stopping"
          ? t("pages.common.status.stopping", "停止中")
          : t("pages.common.status.stopped", "已停止");

  return (
    <>
      <PageHeader
        title={t("overview.title", "服务器总览")}
        desc={t("overview.desc", "运行状态、联机情况与性能数据集中在此，需要处理的问题会优先显示。")}
        actions={<Button variant="secondary" onClick={() => setCreating(true)}><Plus className="size-4" />{t("pages.common.newServer", "新建服务器")}</Button>}
      />

      <PageBody className="space-y-5">
        <Card className="panel-wash overflow-hidden p-0">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="brand-mark hidden size-12 shrink-0 place-items-center rounded-xl sm:grid" aria-hidden="true">
                <Server className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge variant={running ? "green" : status === "stopped" ? "gray" : "amber"} size="sm">
                    <span className="status-dot" />{statusLabel}
                  </Badge>
                  <span className="t-label-12 text-gray-700">{active.mcVersion} · {serverTypeLabel(serverType)}</span>
                </div>
                <h2 className="t-h-32 mt-2 break-words text-gray-1000">{active.name}</h2>
                <p className="t-mono-12 mt-1 truncate text-gray-700" title={active.dir}>{active.dir}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => navigate(`/instances/${active.id}/console`)}>
                <Terminal className="size-4" />{t("overview.console", "控制台")}
              </Button>
              <Button variant={running ? "error" : "accent"} onClick={toggle} size="lg" className="min-w-[136px]">
                {running ? <Square className="size-4" /> : <Play className="size-4" />}
                {running ? t("overview.stopServer", "停止服务器") : t("overview.startServer", "启动服务器")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-gray-300 lg:grid-cols-4">
            <Stat icon={<Clock />} label={t("overview.statUptime", "运行时长")} value={running ? formatDuration(uptime) : t("overview.notRunning", "未运行")} />
            <Stat icon={<Users />} label={t("overview.statPlayers", "在线玩家")} value={running ? t("overview.playersOnline", "{n} 人", { n: players.length }) : "—"} />
            <Stat icon={<Cpu />} label={t("overview.statMemory", "内存占用")} value={running && memoryUsed ? formatBytes(memoryUsed) : t("overview.memLimit", "上限 {n} GB", { n: active.memoryMax })} />
            <Stat icon={<Network />} label={t("overview.statPort", "服务端口")} value={String(active.port)} />
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHead
              icon={<Link2 className="size-[18px]" />}
              title={t("overview.reach.title", "朋友能不能进来")}
              desc={
                lifecycle === "room"
                  ? t("overview.reach.descRoom", "临时房间：玩完就关，把邀请发给朋友即可，不需要固定地址。")
                  : t("overview.reach.descPersistent", "常驻服务器：长期开放，先检测；通了哪条，就把哪条地址固定发给朋友。")
              }
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    size="sm"
                    value={lifecycle}
                    onValueChange={(v) => void updateInstance(active.id, { lifecycle: v })}
                    options={[
                      { value: "room", label: t("overview.lifecycle.room", "临时房间"), title: t("overview.lifecycle.roomHint", "玩完就关，邀请只对这一次有效") },
                      { value: "persistent", label: t("overview.lifecycle.persistent", "常驻服务器"), title: t("overview.lifecycle.persistentHint", "长期开放，地址固定") },
                    ]}
                  />
                  <Button variant="ghost" size="sm" onClick={() => navigate("/network")}>
                    {t("overview.networkSettings", "联机设置")}<ArrowUpRight className="size-3.5" />
                  </Button>
                </div>
              }
            />
            <div className="mt-5 space-y-3">
              <ReachabilityPanel
                port={active.port}
                variant={lifecycle}
                onInvite={() => setInviteOpen(true)}
                notify
              />
              <p className="t-copy-13 text-gray-800">{t("overview.clientRequirement", "客户端要求：")}<span className="text-gray-1000">{clientRequirementOf(serverType)}</span></p>
            </div>
          </Card>

          <Card className="xl:col-span-5">
            <CardHead
              icon={<Gauge className="size-[18px]" />}
              title={t("overview.health.title", "运行状态")}
              desc={running ? t("overview.health.descRunning", "数据会随服务器运行自动更新。") : t("overview.health.descIdle", "启动服务器后，此处会记录实时运行表现。")}
            />
            <div className="mt-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="t-label-12 text-gray-700">{t("overview.health.tps", "当前 TPS")}</div>
                  <div className="mt-1 text-[32px] font-semibold leading-10 tracking-[-0.04em] text-gray-1000">{running ? tps.toFixed(1) : "—"}</div>
                </div>
                <Badge variant={running && tps < 15 ? "amber" : running ? "green" : "gray"} size="sm">
                  {running
                    ? tps >= 19
                      ? t("overview.tps.smooth", "流畅")
                      : tps >= 15
                        ? t("overview.tps.variable", "有波动")
                        : t("overview.tps.attention", "需要关注")
                    : t("overview.tps.waiting", "等待启动")}
                </Badge>
              </div>
              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-label-12 text-gray-800">{t("overview.health.memory", "内存")}</span>
                  <span className="t-mono-12 text-gray-900">{running && memoryUsed ? formatBytes(memoryUsed) : "—"} / {active.memoryMax} GB</span>
                </div>
                <Progress
                  value={memPct}
                  tone={memPct > 90 ? "danger" : memPct > 75 ? "warning" : "brand"}
                  label={t("overview.health.memUsage", "内存使用率")}
                  className="mt-2"
                />
              </div>
              <div className="mt-5 rounded-lg bg-background-200 p-3">
                <div className="flex items-center gap-2 t-label-12 text-gray-800"><Zap className="size-3.5" />{t("overview.health.lag", "最近卡顿")}</div>
                {lagEvents.length === 0 ? (
                  <p className="t-copy-13 mt-1.5 text-gray-700">{running ? t("overview.health.lagNoneRunning", "目前没有发现卡顿告警。") : t("overview.health.lagNoneIdle", "暂无数据，启动服务器后即可查看。")}</p>
                ) : (
                  <p className="t-mono-12 mt-1.5 text-gray-1000">{formatDateTime(lagEvents[0].at)} · {describeLag(lagEvents[0].behindMs)}{lagEvents.length > 1 ? t("overview.health.lagCount", "（共 {n} 次）", { n: lagEvents.length }) : ""}</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="xl:col-span-5">
            <CardHead icon={<Zap className="size-[18px]" />} title={t("overview.actions.title", "常用操作")} desc={t("overview.actions.desc", "备份、配置与目录，一键直达。")} />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Shortcut icon={<Save />} label={t("overview.action.backup", "整包备份")} hint={t("overview.action.backupHint", "保存完整 ZIP")} busy={busy === "backup"} onClick={() => run("backup", async () => {
                const res = await window.mcss.backup.create(active.dir);
                if (res.ok) toast.success(t("overview.backupDone", "备份完成"), { description: res.name });
                else toast.error(res.error || t("overview.backupFailed", "备份失败"));
              })} />
              <Shortcut icon={<Clock />} label={t("overview.action.snapshot", "时间机快照")} hint={t("overview.action.snapshotHint", "只保存新增变化")} busy={busy === "snap"} onClick={() => run("snap", async () => {
                const res = await window.mcss.backup.snapshot(active.dir);
                if (res.ok) toast.success(t("overview.snapshotDone", "快照完成"), { description: t("overview.snapshotDoneDesc", "{files} 个文件 · 新增 {size}", { files: res.files ?? 0, size: formatBytes(res.bytesNew ?? 0) }) });
                else toast.error(res.error || t("overview.snapshotFailed", "快照失败"));
              })} />
              <Shortcut icon={<RefreshCw />} label={t("overview.action.restart", "重启服务器")} hint={running ? t("overview.action.restartHintRunning", "停稳后重新启动") : t("overview.action.restartHintStopped", "服务器尚未运行")} busy={busy === "restart"} disabled={!running} onClick={() => run("restart", async () => {
                await window.mcss.server.stop();
                for (let i = 0; i < 60; i++) {
                  const current = await window.mcss.server.status().catch(() => "stopped");
                  if (current === "stopped") break;
                  await new Promise((resolve) => setTimeout(resolve, 500));
                }
                const res = await window.mcss.server.start(active.id).catch((error) => ({ ok: false, error: String(error) }));
                if (res.ok) toast.success(t("overview.restarted", "服务器已重新启动"));
                else toast.error(t("overview.restartFailed", "重启失败：{reason}", { reason: res.error || t("overview.unknownReason", "未知原因") }));
              })} />
              <Shortcut icon={<Settings2 />} label={t("overview.action.editConfig", "编辑配置")} hint="server.properties" onClick={() => navigate(`/instances/${active.id}/config`)} />
              <Shortcut icon={<FolderOpen />} label={t("overview.action.openDir", "打开目录")} hint={t("overview.action.openDirHint", "在文件管理器中查看")} onClick={() => void window.mcss.app.openPath(active.dir)} />
            </div>
          </Card>

          <Card className="xl:col-span-7">
            <CardHead
              icon={<ScrollText className="size-[18px]" />}
              title={t("overview.logs.title", "最近日志")}
              desc={t("overview.logs.desc", "最新输出显示在末尾，完整记录请前往控制台查看。")}
              action={<Button variant="ghost" size="sm" onClick={() => navigate(`/instances/${active.id}/console`)}>{t("overview.logs.open", "打开控制台")}<ArrowUpRight className="size-3.5" /></Button>}
            />
            <div className="mt-5 min-h-[176px] rounded-lg bg-background-200 p-3.5" role="log" aria-label={t("overview.logs.aria", "最近服务器日志")}>
              {logs.length === 0 ? (
                <div className="grid min-h-[148px] place-items-center text-center">
                  <p className="t-copy-13 text-gray-700">{running ? t("overview.logs.waiting", "服务器已启动，正在等待日志输出。") : t("overview.logs.empty", "暂无日志，启动服务器后此处会实时更新。")}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.slice(-7).map((log) => (
                    <div key={log.id} className="flex gap-2.5">
                      <span className="t-mono-12 shrink-0 text-gray-700">{log.timestamp}</span>
                      <span className={log.level === "ERROR" ? "t-mono-12 line-clamp-2 text-red-900" : log.level === "WARN" ? "t-mono-12 line-clamp-2 text-amber-900" : "t-mono-12 line-clamp-2 text-gray-900"}>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {contentKindOf(serverType) === "datapack" ? (
          <Card className="flex flex-col gap-4 border-amber-700/20 bg-amber-700/5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="t-h-14 text-gray-1000">{t("overview.vanilla.title", "原版服务器不能安装插件")}</div>
              <p className="t-copy-13 mt-1 text-gray-800">{t("overview.vanilla.desc", "如需领地保护、传送或经济系统，可改用 Paper 核心，玩家仍可使用原版客户端加入。")}</p>
            </div>
            <Button variant="secondary" onClick={() => navigate(`/instances/${activeId ?? ""}/content`)}>{t("overview.vanilla.action", "查看服务器核心")}</Button>
          </Card>
        ) : null}
      </PageBody>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      <PreflightDialog open={preflightOpen} onOpenChange={setPreflightOpen} instance={active} onStarted={() => toast.success(t("pages.common.serverStarted", "服务器已启动"), { description: t("pages.common.startedDesc", "现在可以生成邀请，将地址发送给朋友。"), action: { label: t("pages.common.generateInvite", "生成邀请"), onClick: () => setInviteOpen(true) } })} />
      <StopServerDialog open={stopOpen} onOpenChange={setStopOpen} players={players.length} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} instance={active} />
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border-gray-300 p-4 odd:border-r sm:p-5 lg:border-r lg:last:border-r-0">
      <div className="flex items-center gap-2 text-gray-700"><span className="[&>svg]:size-3.5">{icon}</span><span className="t-label-12">{label}</span></div>
      <div className="t-mono-13 mt-2 truncate font-medium text-gray-1000" title={value}>{value}</div>
    </div>
  );
}

function CardHead({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-brand-600">{icon}</span>
        <div><h3 className="t-h-16 text-gray-1000">{title}</h3><p className="t-copy-13 mt-1 text-gray-800">{desc}</p></div>
      </div>
      {action}
    </div>
  );
}

function Shortcut({ icon, label, hint, onClick, busy, disabled }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="group flex min-h-[68px] items-center gap-3 rounded-lg border border-transparent bg-background-200 p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-swift hover:border-gray-300 hover:bg-gray-100 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background-100 text-gray-800 shadow-geist-border [&>svg]:size-4">{busy ? <RefreshCw className="size-4 animate-spin" /> : icon}</span>
      <span className="min-w-0"><span className="t-label-13 block font-medium text-gray-1000">{label}</span><span className="mt-0.5 block text-[11px] leading-4 text-gray-700">{hint}</span></span>
    </button>
  );
}
