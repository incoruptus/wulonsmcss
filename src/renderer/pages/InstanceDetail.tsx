import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Play, Square, FolderOpen, ArrowLeft, Settings2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { cx } from "@/lib/utils";
import { InstanceOverview } from "@/components/instance/InstanceOverview";
import { ConsoleTab } from "@/components/instance/ConsoleTab";
import { ConfigTab } from "@/components/instance/ConfigTab";
import { ModsTab } from "@/components/instance/ModsTab";
import { WorldsTab } from "@/components/instance/WorldsTab";
import { PlayersTab } from "@/components/instance/PlayersTab";
import { InstanceSettingsDialog } from "@/components/instance/InstanceSettingsDialog";

const TABS = [
  { id: "overview", label: "概览" },
  { id: "console", label: "控制台" },
  { id: "config", label: "配置" },
  { id: "mods", label: "Mod" },
  { id: "worlds", label: "世界" },
  { id: "players", label: "玩家" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function InstanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const instance = useConfig((s) => s.cfg.instances.find((i) => i.id === id));
  const setActive = useConfig((s) => s.setActiveInstance);
  const status = useServer((s) => s.status);
  const [tab, setTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (id) void setActive(id);
  }, [id, setActive]);

  if (!instance) {
    return (
      <div className="p-10">
        <Button variant="secondary" onClick={() => navigate("/instances")}>
          <ArrowLeft className="size-4" />
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
    const res = await window.mcss.server.start(instance!.id);
    if (!res.ok) toast.error(res.error || "启动失败");
  }

  return (
    <>
      <div className="border-b border-gray-300 bg-background-100">
        <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-5">
          <IconButton label="返回" size="sm" onClick={() => navigate("/instances")}>
            <ArrowLeft className="size-4" />
          </IconButton>
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
            <IconButton label="打开服务器目录" onClick={() => window.mcss.app.openPath(instance.dir)}>
              <FolderOpen className="size-4" />
            </IconButton>
            <IconButton label="实例设置" onClick={() => setEditing(true)}>
              <Settings2 className="size-4" />
            </IconButton>
            <Button variant={running ? "error" : "default"} onClick={toggle}>
              {running ? <Square className="size-4" /> : <Play className="size-4" />}
              {running ? "停止" : "启动"}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative px-3 py-2 t-label-13 transition-colors",
                tab === t.id ? "text-gray-1000" : "text-gray-700 hover:text-gray-1000",
              )}
            >
              {t.label}
              {tab === t.id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gray-1000" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        {tab === "overview" ? <InstanceOverview instance={instance} onEdit={() => setEditing(true)} /> : null}
        {tab === "console" ? <ConsoleTab instance={instance} /> : null}
        {tab === "config" ? <ConfigTab instance={instance} /> : null}
        {tab === "mods" ? <ModsTab instance={instance} /> : null}
        {tab === "worlds" ? <WorldsTab instance={instance} /> : null}
        {tab === "players" ? <PlayersTab instance={instance} /> : null}
      </div>

      <InstanceSettingsDialog open={editing} onOpenChange={setEditing} instance={instance} />
    </>
  );
}
