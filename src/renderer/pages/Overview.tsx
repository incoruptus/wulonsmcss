import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Play, Square, Plus, Cloud, ArrowRight, Server } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { formatDuration } from "@/lib/utils";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { PreflightDialog } from "@/components/instance/PreflightDialog";
import { InviteDialog } from "@/components/instance/InviteDialog";

export default function Overview() {
  const navigate = useNavigate();
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const setActive = useConfig((s) => s.setActiveInstance);
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const logs = useServer((s) => s.logs);
  const players = useServer((s) => s.players);
  const memoryUsed = useServer((s) => s.memoryUsed);
  const setMemory = useServer((s) => s.setMemory);

  const [creating, setCreating] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const active = useMemo(() => instances.find((i) => i.id === activeId) ?? instances[0], [instances, activeId]);
  const running = status === "running" || status === "starting";

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const bytes = await window.mcss.server.memory().catch(() => 0);
      if (bytes > 0) setMemory(bytes);
    }, 5000);
    return () => clearInterval(t);
  }, [running, setMemory]);

  async function toggle() {
    if (!active) return;
    if (running) {
      await window.mcss.server.stop();
      return;
    }
    setPreflightOpen(true);
  }

  const uptime = running && startedAt ? Math.floor((now - startedAt) / 1000) : 0;

  return (
    <>
      <PageHeader
        title="概览"
        desc="一台机器上的所有服务器，都在这里。"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            新建实例
          </Button>
        }
      />
      <PageBody className="space-y-5">
        {!active ? (
          <Card>
            <EmptyState
              icon={<Server className="size-5" />}
              title="还没有服务器"
              desc="新建一个实例，选好版本就能一键下载服务端并开服。"
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  新建服务器实例
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={status === "running" ? "green" : status === "stopped" ? "gray" : "amber"} size="sm">
                    {status === "running" ? "运行中" : status === "starting" ? "启动中" : status === "stopping" ? "停止中" : "已停止"}
                  </Badge>
                  <span className="t-label-12 text-gray-700">
                    {active.mcVersion} · {active.loader}
                    {active.loaderVersion ? ` ${active.loaderVersion}` : ""}
                  </span>
                </div>
                <h2 className="t-h-24 mt-2 truncate text-gray-1000">{active.name}</h2>
                <p className="t-mono-12 mt-0.5 truncate text-gray-700">{active.dir}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => navigate(`/instances/${active.id}`)}>
                  打开实例
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  variant={running ? "error" : "default"}
                  onClick={toggle}
                  size="lg"
                  className="min-w-[132px]"
                >
                  {running ? <Square className="size-4" /> : <Play className="size-4" />}
                  {running ? "停止服务器" : "启动服务器"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="运行时长" value={running ? formatDuration(uptime) : "—"} />
              <Stat label="在线玩家" value={running ? String(players.length) : "—"} />
              <Stat label="内存占用" value={running && memoryUsed ? `${(memoryUsed / 1024 ** 3).toFixed(1)} GB` : "—"} />
              <Stat label="端口" value={String(active.port)} />
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="t-h-14 text-gray-1000">实例</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate("/instances")}>
                全部
              </Button>
            </div>
            {instances.length === 0 ? (
              <div className="t-label-13 py-6 text-center text-gray-700">暂无实例</div>
            ) : (
              <div className="divide-y divide-gray-300">
                {instances.slice(0, 5).map((inst) => (
                  <button
                    key={inst.id}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                    onClick={() => {
                      void setActive(inst.id);
                      navigate(`/instances/${inst.id}`);
                    }}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gray-200 text-gray-900">
                      <Server className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-label-14 block truncate text-gray-1000">{inst.name}</span>
                      <span className="t-label-12 block truncate text-gray-700">
                        {inst.mcVersion} · {inst.loader}
                      </span>
                    </span>
                    {inst.id === active?.id ? <Badge variant="blue" size="sm">当前</Badge> : null}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="t-h-14 text-gray-1000">最近日志</h3>
              {active ? (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/instances/${active.id}`)}>
                  控制台
                </Button>
              ) : null}
            </div>
            <div className="space-y-1">
              {logs.length === 0 ? (
                <div className="t-label-13 py-6 text-center text-gray-700">还没有日志，启动服务器后这里会实时滚动</div>
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
      </PageBody>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      {active ? (
        <>
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
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background-100 p-3 shadow-geist-border">
      <div className="t-label-12 text-gray-700">{label}</div>
      <div className="t-mono-13 mt-1 text-gray-1000">{value}</div>
    </div>
  );
}
