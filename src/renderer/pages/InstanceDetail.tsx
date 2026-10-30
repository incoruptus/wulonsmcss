import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Play, Square, FolderOpen, Settings2 } from "lucide-react";
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

/** 侧栏能点的「当前实例的面」；URL 用同一个词，刷新/深链都不会丢 */
const TABS = ["overview", "console", "config", "content", "worlds", "players"] as const;
type TabId = (typeof TABS)[number];

export default function InstanceDetail() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const instance = useConfig((s) => s.cfg.instances.find((i) => i.id === id));
  const setActive = useConfig((s) => s.setActiveInstance);
  const status = useServer((s) => s.status);
  const [editing, setEditing] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const current: TabId = TABS.includes(tab as TabId) ? (tab as TabId) : "overview";

  useEffect(() => {
    if (id) void setActive(id);
  }, [id, setActive]);

  if (!instance) {
    return (
      <div className="p-10">
        <Button variant="secondary" onClick={() => navigate("/instances")}>
          返回实例列表
        </Button>
        <p className="t-label-13 mt-4 text-gray-800">找不到这个实例，可能已被删除。</p>
      </div>
    );
  }

  const running = status === "running" || status === "starting";

  async function toggle() {
    if (running) {
      await window.mcss.server.stop();
      return;
    }
    setPreflightOpen(true);
  }

  return (
    <>
      <div className="border-b border-gray-300 bg-background-100">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="t-h-20 truncate text-gray-1000">{instance.name}</h1>
              <Badge variant={running ? "green" : status === "stopped" ? "gray" : "amber"} size="sm">
                {running ? "运行中" : status === "stopped" ? "已停止" : "过渡中"}
              </Badge>
            </div>
            <p className="t-label-12 mt-0.5 text-gray-700">
              {instance.mcVersion} · {instance.loader}
              {instance.loaderVersion ? ` ${instance.loaderVersion}` : ""} · 端口 {instance.port}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)}>
              邀请
            </Button>
            <IconButton label="打开服务器目录" onClick={() => window.mcss.app.openPath(instance.dir)}>
              <FolderOpen className="size-4" />
            </IconButton>
            <IconButton label="实例设置" onClick={() => setEditing(true)}>
              <Settings2 className="size-4" />
            </IconButton>
            <Button variant={running ? "error" : "default"} size="sm" onClick={toggle}>
              {running ? <Square className="size-4" /> : <Play className="size-4" />}
              {running ? "停止" : "启动"}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        {current === "overview" ? <InstanceOverview instance={instance} onEdit={() => setEditing(true)} /> : null}
        {current === "console" ? <ConsoleTab instance={instance} /> : null}
        {current === "config" ? <ConfigTab instance={instance} /> : null}
        {current === "content" ? <ContentTab instance={instance} onEdit={() => setEditing(true)} /> : null}
        {current === "worlds" ? <WorldsTab instance={instance} /> : null}
        {current === "players" ? <PlayersTab instance={instance} /> : null}
      </div>

      <InstanceSettingsDialog open={editing} onOpenChange={setEditing} instance={instance} />
      <PreflightDialog
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        instance={instance}
        onStarted={() =>
          toast.success("服务器已启动", {
            description: "把邀请链接发给朋友，他们点开就能知道怎么进。",
            action: { label: "生成邀请", onClick: () => setInviteOpen(true) },
          })
        }
      />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} instance={instance} />
    </>
  );
}
