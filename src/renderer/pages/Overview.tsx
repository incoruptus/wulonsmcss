import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  Clock,
  Copy,
  FolderOpen,
  Gauge,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings2,
  Square,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { copyText, formatBytes, formatDuration, formatDateTime } from "@/lib/utils";
import { clientRequirementOf, contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { describeLag } from "@/lib/lag";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { PreflightDialog } from "@/components/instance/PreflightDialog";
import { InviteDialog } from "@/components/instance/InviteDialog";

/**
 * 服主首页 = 当前实例的仪表盘
 * ------------------------------------------------------------
 * 一屏回答四个问题：我这条命还在不在（状态条）、它还健康吗（性能）、
 * 朋友怎么进来（邀请联机）、刚才发生了什么（日志）。
 * 每一格都能点进去做事，不做纯展示。
 */
export default function Overview() {
  const navigate = useNavigate();
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const logs = useServer((s) => s.logs);
  const players = useServer((s) => s.players);
  const memoryUsed = useServer((s) => s.memoryUsed);
  const setMemory = useServer((s) => s.setMemory);
  const lagEvents = useServer((s) => s.lagEvents);
  const tps = useServer((s) => s.tps);

  const [creating, setCreating] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lanIp, setLanIp] = useState("");
  const [frp, setFrp] = useState<{ running: boolean; address?: string }>({ running: false });
  const [busy, setBusy] = useState<string | null>(null);

  const active = useMemo(() => instances.find((i) => i.id === activeId) ?? instances[0], [instances, activeId]);
  const running = status === "running" || status === "starting";

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      const bytes = await window.mcss.server.memory().catch(() => 0);
      if (bytes > 0) setMemory(bytes);
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [running, setMemory]);

  useEffect(() => {
    void window.mcss.app.lanAddress().then((r) => setLanIp(r.ip)).catch(() => setLanIp(""));
    void window.mcss.frp.status().then(setFrp).catch(() => setFrp({ running: false }));
  }, [active?.id]);

  async function toggle() {
    if (!active) return;
    if (running) {
      await window.mcss.server.stop();
      return;
    }
    setPreflightOpen(true);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  if (!active) {
    return (
      <>
        <PageHeader title="总览" desc="先把一台服务器开起来，剩下的都在这一屏。" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Server className="size-5" />}
              title="还没有服务器"
              desc="新建一个实例，选好版本就能一键下载服务端并开服。"
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  新建服务器
                </Button>
              }
            />
          </Card>
          <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
        </PageBody>
      </>
    );
  }

  const serverType = serverTypeOf(active);
  const uptime = running && startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const address = `${lanIp || "127.0.0.1"}:${active.port}`;
  const memMaxBytes = Math.max(1, active.memoryMax) * 1024 ** 3;
  const memPct = Math.min(100, Math.round((memoryUsed / memMaxBytes) * 100));

  return (
    <>
      <PageHeader
        title="总览"
        desc={`${active.mcVersion} · ${serverTypeLabel(serverType)} · 端口 ${active.port}`}
        actions={
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            新建
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {/* 状态条：一眼看清这条命在不在 */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant={running ? "green" : status === "stopped" ? "gray" : "amber"} size="sm">
                  {status === "running" ? "运行中" : status === "starting" ? "启动中" : status === "stopping" ? "停止中" : "已停止"}
                </Badge>
                <span className="t-label-12 text-gray-700">{clientRequirementOf(serverType)}</span>
              </div>
              <h2 className="t-h-24 mt-2 truncate text-gray-1000">{active.name}</h2>
              <p className="t-mono-12 mt-0.5 truncate text-gray-700">{active.dir}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate(`/instances/${active.id}`)}>
                打开实例
                <ArrowRight className="size-4" />
              </Button>
              <Button variant={running ? "error" : "default"} onClick={toggle} size="lg" className="min-w-[132px]">
                {running ? <Square className="size-4" /> : <Play className="size-4" />}
                {running ? "停止服务器" : "启动服务器"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Stat label="运行时长" value={running ? formatDuration(uptime) : "—"} />
            <Stat label="在线玩家" value={running ? `${players.length} 人` : "—"} />
            <Stat label="内存占用" value={running && memoryUsed ? formatBytes(memoryUsed) : "—"} />
            <Stat label="端口" value={String(active.port)} />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 性能 */}
          <Card>
            <CardHead
              icon={<Gauge className="size-4" />}
              title="性能"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate(`/instances/${active.id}?tab=console`)}>
                  控制台
                </Button>
              }
            />
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="t-label-12 text-gray-800">内存</span>
                  <span className="t-mono-12 text-gray-900">
                    {running && memoryUsed ? formatBytes(memoryUsed) : "—"} / {active.memoryMax} GB
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                  <div
                    className={
                      memPct > 90 ? "h-full rounded-full bg-red-700" : memPct > 75 ? "h-full rounded-full bg-amber-700" : "h-full rounded-full bg-green-800"
                    }
                    style={{ width: `${Math.max(2, memPct)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between t-label-13">
                <span className="text-gray-800">TPS</span>
                <span className="t-mono-13 text-gray-1000">{running ? tps.toFixed(1) : "—"}</span>
              </div>

              <div className="rounded-lg bg-background-100 p-2.5 shadow-geist-border">
                <div className="flex items-center gap-1.5 t-label-12 text-gray-800">
                  <Zap className="size-3.5" />
                  最近卡顿
                </div>
                {lagEvents.length === 0 ? (
                  <p className="t-label-12 mt-1 text-gray-700">{running ? "暂时没有卡顿告警" : "启动后开始记录"}</p>
                ) : (
                  <p className="t-mono-12 mt-1 text-gray-1000">
                    {formatDateTime(lagEvents[0].at)} · {describeLag(lagEvents[0].behindMs)}
                    {lagEvents.length > 1 ? `（共 ${lagEvents.length} 次）` : ""}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* 邀请与联机 */}
          <Card>
            <CardHead
              icon={<Link2 className="size-4" />}
              title="邀请与快速配置联机"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("/network")}>
                  联机设置
                </Button>
              }
            />
            <div className="mt-3 space-y-2.5">
              <div className="rounded-lg bg-background-100 p-2.5 shadow-geist-border">
                <div className="flex items-center gap-1.5 t-label-12 text-gray-800">
                  <Wifi className="size-3.5" />
                  同一 WiFi 直接用这个
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="t-mono-12 truncate text-gray-1000">{address}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await copyText(address);
                      toast[ok ? "success" : "error"](ok ? "地址已复制" : "复制失败");
                    }}
                  >
                    <Copy className="size-3.5" />
                    复制
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between t-label-13">
                <span className="text-gray-800">外网穿透</span>
                <span className={frp.running ? "text-green-900" : "text-gray-700"}>
                  {frp.running ? frp.address || "已开启" : "未开启"}
                </span>
              </div>

              <p className="t-label-12 text-gray-800">
                朋友要装什么：<span className="text-gray-1000">{clientRequirementOf(serverType)}</span>
              </p>

              <Button className="w-full" onClick={() => setInviteOpen(true)}>
                <Users className="size-4" />
                生成邀请（房间码 / 链接）
              </Button>
            </div>
          </Card>

          {/* 快捷方式 */}
          <Card>
            <CardHead icon={<Zap className="size-4" />} title="快捷方式" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Shortcut
                icon={<Save className="size-4" />}
                label="整包备份"
                hint="存一份完整 zip"
                busy={busy === "backup"}
                onClick={() =>
                  run("backup", async () => {
                    const res = await window.mcss.backup.create(active.dir);
                    if (res.ok) toast.success("备份完成", { description: res.name });
                    else toast.error(res.error || "备份失败");
                  })
                }
              />
              <Shortcut
                icon={<Clock className="size-4" />}
                label="时间机快照"
                hint="只存变过的文件"
                busy={busy === "snap"}
                onClick={() =>
                  run("snap", async () => {
                    const res = await window.mcss.backup.snapshot(active.dir);
                    if (res.ok) {
                      toast.success("快照完成", {
                        description: `${res.files ?? 0} 个文件 · 新增 ${formatBytes(res.bytesNew ?? 0)}`,
                      });
                    } else toast.error(res.error || "快照失败");
                  })
                }
              />
              <Shortcut
                icon={<RefreshCw className="size-4" />}
                label="重启服务器"
                hint={running ? "停稳后再拉起来" : "当前没在跑"}
                busy={busy === "restart"}
                disabled={!running}
                onClick={() =>
                  run("restart", async () => {
                    await window.mcss.server.stop();
                    // 等它真的停下来再拉起来，否则端口还会被占着
                    for (let i = 0; i < 60; i++) {
                      const s = await window.mcss.server.status().catch(() => "stopped");
                      if (s === "stopped") break;
                      await new Promise((r) => setTimeout(r, 500));
                    }
                    const res = await window.mcss.server.start(active.id).catch((e) => ({ ok: false, error: String(e) }));
                    if (res.ok) toast.success("已重新启动");
                    else toast.error(`重启失败：${res.error || "未知原因"}`);
                  })
                }
              />
              <Shortcut
                icon={<Settings2 className="size-4" />}
                label="编辑配置"
                hint="server.properties"
                onClick={() => navigate(`/instances/${active.id}?tab=config`)}
              />
              <Shortcut
                icon={<FolderOpen className="size-4" />}
                label="打开目录"
                hint="文件管理器"
                onClick={() => void window.mcss.app.openPath(active.dir)}
              />
            </div>
          </Card>

          {/* 最近日志 */}
          <Card>
            <CardHead
              icon={<Server className="size-4" />}
              title="最近日志"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate(`/instances/${active.id}?tab=console`)}>
                  控制台
                </Button>
              }
            />
            <div className="mt-3 space-y-1">
              {logs.length === 0 ? (
                <div className="t-label-13 py-6 text-center text-gray-700">
                  {running ? "还没有输出" : "启动服务器后这里会实时滚动"}
                </div>
              ) : (
                logs.slice(-8).map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="t-mono-12 shrink-0 text-gray-600">{log.timestamp}</span>
                    <span
                      className={
                        log.level === "ERROR"
                          ? "t-mono-12 line-clamp-2 text-red-900"
                          : log.level === "WARN"
                            ? "t-mono-12 line-clamp-2 text-amber-900"
                            : "t-mono-12 line-clamp-2 text-gray-900"
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {contentKindOf(serverType) === "datapack" ? (
          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="t-label-14 text-gray-1000">原版服装不了插件</div>
              <p className="t-label-12 mt-0.5 text-gray-800">
                想要地皮保护、传送、经济这些，需要换成 Paper（玩家仍然用原版客户端就能进）。
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate("/library")}>
              去看看
            </Button>
          </Card>
        ) : null}
      </PageBody>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      <PreflightDialog
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        instance={active}
        onStarted={() =>
          toast.success("服务器已启动", {
            description: "把邀请链接发给朋友，他们点开就知道怎么进。",
            action: { label: "生成邀请", onClick: () => setInviteOpen(true) },
          })
        }
      />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} instance={active} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background-100 p-3 shadow-geist-border">
      <div className="t-label-12 text-gray-700">{label}</div>
      <div className="t-mono-13 mt-1 truncate text-gray-1000">{value}</div>
    </div>
  );
}

function CardHead({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 t-h-14 text-gray-1000">
        <span className="text-gray-700">{icon}</span>
        {title}
      </h3>
      {action}
    </div>
  );
}

function Shortcut({
  icon,
  label,
  hint,
  onClick,
  busy,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={
        "flex items-start gap-2 rounded-lg bg-background-100 p-2.5 text-left shadow-geist-border transition-colors " +
        (disabled ? "opacity-50" : "hover:bg-gray-100")
      }
    >
      <span className="mt-0.5 text-gray-800">{busy ? <RefreshCw className="size-4 animate-spin" /> : icon}</span>
      <span className="min-w-0">
        <span className="t-label-13 block text-gray-1000">{label}</span>
        <span className="t-label-12 block text-gray-700">{hint}</span>
      </span>
    </button>
  );
}
