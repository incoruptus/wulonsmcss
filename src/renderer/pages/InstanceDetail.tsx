import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Play, Square, FolderOpen, Settings2, Send } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { InstanceOverview } from "@/components/instance/InstanceOverview";
import { ConsoleTab } from "@/components/instance/ConsoleTab";
import { ConfigTab } from "@/components/instance/ConfigTab";
import { WorldsTab } from "@/components/instance/WorldsTab";
import { PlayersTab } from "@/components/instance/PlayersTab";
import { ContentTab } from "@/components/instance/ContentTab";
import { InstanceSettingsDialog } from "@/components/instance/InstanceSettingsDialog";
import { PreflightDialog } from "@/components/instance/PreflightDialog";
import { InviteDialog } from "@/components/instance/InviteDialog";
import { StopServerDialog } from "@/components/instance/StopServerDialog";
import { serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { cx } from "@/lib/utils";

const TABS = ["overview", "console", "config", "content", "worlds", "players"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABELS: Record<TabId, string> = {
  overview: "总览",
  console: "控制台",
  config: "配置",
  content: "内容",
  worlds: "世界",
  players: "玩家",
};

export default function InstanceDetail() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const instance = useConfig((s) => s.cfg.instances.find((i) => i.id === id));
  const setActive = useConfig((s) => s.setActiveInstance);
  const status = useServer((s) => s.status);
  const players = useServer((s) => s.players);
  const [editing, setEditing] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const current: TabId = TABS.includes(tab as TabId) ? (tab as TabId) : "overview";

  useEffect(() => {
    if (id) void setActive(id);
  }, [id, setActive]);

  if (!instance) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="t-h-24 text-gray-1000">这台服务器不在了</h1>
        <p className="t-copy-14 mt-3 text-gray-800">它可能已被移除，或者链接里的编号已经失效。</p>
        <Button className="mt-6" variant="secondary" onClick={() => navigate("/instances")}>返回服务器列表</Button>
      </div>
    );
  }

  const running = status === "running" || status === "starting";
  const statusLabel = status === "running" ? "运行中" : status === "starting" ? "启动中" : status === "stopping" ? "停止中" : "已停止";

  async function toggle() {
    if (running) setStopOpen(true);
    else setPreflightOpen(true);
  }

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-gray-300 bg-background-100/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="t-h-24 min-w-0 break-words text-gray-1000">{instance.name}</h1>
              <Badge variant={running ? "green" : status === "stopped" ? "gray" : "amber"} size="sm"><span className="status-dot" />{statusLabel}</Badge>
            </div>
            <p className="t-label-12 mt-1 text-gray-700">
              {instance.mcVersion} · {serverTypeLabel(serverTypeOf(instance))}{instance.loaderVersion ? ` ${instance.loaderVersion}` : ""} · 端口 {instance.port}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}><Send className="size-3.5" />邀请朋友</Button>
            <IconButton label="打开服务器目录" size="sm" variant="secondary" onClick={() => window.mcss.app.openPath(instance.dir)}><FolderOpen className="size-4" /></IconButton>
            <IconButton label="服务器设置" size="sm" variant="secondary" onClick={() => setEditing(true)}><Settings2 className="size-4" /></IconButton>
            <Button variant={running ? "error" : "accent"} size="sm" onClick={toggle} className="min-w-20">
              {running ? <Square className="size-3.5" /> : <Play className="size-3.5" />}{running ? "停止" : "启动"}
            </Button>
          </div>
        </div>

        <nav aria-label="服务器页面" className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => navigate(`/instances/${instance.id}/${item}`)}
              aria-current={current === item ? "page" : undefined}
              className={cx(
                "min-h-9 shrink-0 rounded-lg px-3 text-[13px] transition-colors",
                current === item ? "bg-tea-100 font-medium text-tea-700" : "text-gray-800 active:bg-gray-100",
              )}
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {current === "overview" ? <InstanceOverview instance={instance} onEdit={() => setEditing(true)} /> : null}
        {current === "console" ? <ConsoleTab instance={instance} /> : null}
        {current === "config" ? <ConfigTab instance={instance} /> : null}
        {current === "content" ? <ContentTab instance={instance} onEdit={() => setEditing(true)} /> : null}
        {current === "worlds" ? <WorldsTab instance={instance} /> : null}
        {current === "players" ? <PlayersTab instance={instance} /> : null}
      </div>

      <InstanceSettingsDialog open={editing} onOpenChange={setEditing} instance={instance} />
      <PreflightDialog open={preflightOpen} onOpenChange={setPreflightOpen} instance={instance} onStarted={() => toast.success("服务器已启动", { description: "现在可以生成邀请，把地址发给朋友了。", action: { label: "生成邀请", onClick: () => setInviteOpen(true) } })} />
      <StopServerDialog open={stopOpen} onOpenChange={setStopOpen} players={players.length} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} instance={instance} />
    </>
  );
}
