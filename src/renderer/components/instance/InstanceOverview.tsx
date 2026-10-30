import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, FileText, Puzzle, HardDrive, Clock, Users, Cpu, Send, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Card } from "@/components/ui/misc";
import { InviteDialog } from "@/components/instance/InviteDialog";
import { ReachabilityPanel } from "@/components/instance/ReachabilityPanel";
import { useServer } from "@/stores/server";
import { useConfig } from "@/stores/config";
import * as worldsApi from "@/lib/worlds";
import type { Instance, InstanceSchedule } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/utils";
import { contentKindOf, serverTypeOf } from "@/lib/config-model";
import { isDesktopVisual } from "@/lib/shell";

export function InstanceOverview({ instance, onEdit }: { instance: Instance; onEdit: () => void }) {
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const players = useServer((s) => s.players);
  const memoryUsed = useServer((s) => s.memoryUsed);
  const setMemory = useServer((s) => s.setMemory);
  const [now, setNow] = useState(Date.now());
  const [inviting, setInviting] = useState(false);
  const [schedule, setSchedule] = useState<InstanceSchedule>(instance.schedule ?? {});
  const updateInstance = useConfig((s) => s.updateInstance);

  function saveSchedule(next: InstanceSchedule) {
    setSchedule(next);
    void updateInstance(instance.id, { schedule: next });
  }
  const [counts, setCounts] = useState<{ mods: number; worlds: number }>({ mods: 0, worlds: 0 });

  const running = status === "running" || status === "starting";

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      const bytes = await window.mcss.server.memory().catch(() => 0);
      if (alive && bytes > 0) setMemory(bytes);
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [running, setMemory]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [mods, worlds] = await Promise.all([
        window.mcss.mods.scan(`${instance.dir}\\mods`).catch(() => []),
        worldsApi.scan(instance.dir).catch(() => []),
      ]);
      if (alive) setCounts({ mods: mods.length, worlds: worlds.reduce((n, p) => n + p.worlds.length, 0) });
    })();
    return () => {
      alive = false;
    };
  }, [instance.dir]);

  const uptime = running && startedAt ? Math.floor((now - startedAt) / 1000) : 0;

  return (
    <>
      <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Clock className="size-4" />} label="运行时长" value={running ? formatDuration(uptime) : "未运行"} />
        <Metric icon={<Users className="size-4" />} label="在线玩家" value={running ? String(players.length) : "—"} />
        <Metric
          icon={<Cpu className="size-4" />}
          label="内存"
          value={running && memoryUsed ? `${(memoryUsed / 1024 ** 3).toFixed(1)} / ${instance.memoryMax} GB` : `上限 ${instance.memoryMax} GB`}
        />
        <Metric
          icon={<HardDrive className="size-4" />}
          label="内容"
          value={`${counts.mods} 个 Mod · ${counts.worlds} 个世界`}
        />
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Send className="size-4 text-gray-800" />
          <h3 className="t-h-14 text-gray-1000">朋友能不能进来</h3>
        </div>
        <ReachabilityPanel port={instance.port} onInvite={() => setInviting(true)} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="t-h-14 mb-3 text-gray-1000">服务器信息</h3>
          <dl className="space-y-2">
            <Row label="目录" value={<span className="t-mono-12 break-all">{instance.dir}</span>} />
            <Row label="版本" value={`${instance.mcVersion} · ${instance.loader}${instance.loaderVersion ? ` ${instance.loaderVersion}` : ""}`} />
            <Row label="Java" value={<span className="t-mono-12 break-all">{instance.javaPath || "未指定"}</span>} />
            <Row label="内存" value={`${instance.memoryMin} – ${instance.memoryMax} GB`} />
            <Row label="端口" value={String(instance.port)} />
            <Row label="上次启动" value={instance.lastStartedAt ? timeAgo(instance.lastStartedAt) : "从未"} />
            {instance.jvmArgs ? <Row label="JVM 参数" value={<span className="t-mono-12 break-all">{instance.jvmArgs}</span>} /> : null}
          </dl>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.mcss.app.openPath(instance.dir)}>
              <FolderOpen className="size-3.5" />
              打开目录
            </Button>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              编辑设置
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setInviting(true)}>
              <Send className="size-3.5" />
              邀请朋友
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const p = `${instance.dir}\\server.properties`;
                const ok = await window.mcss.fs.exists(p).catch(() => false);
                if (!ok) return toast.error("还没有 server.properties，先启动一次服务器");
                await window.mcss.app.openPath(p);
              }}
            >
              <FileText className="size-3.5" />
              打开配置文件
            </Button>
          </div>
        </Card>

        <Card>
          <h3 className="t-h-14 mb-3 text-gray-1000">接下来做什么</h3>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2 t-label-13 text-gray-900">
              <Puzzle className="mt-0.5 size-4 shrink-0 text-gray-700" />
              <span>
                {contentKindOf(serverTypeOf(instance)) === "plugin"
                  ? "在「插件 → 资源库」里装地皮、传送、经济这些；装完重启服务器生效。"
                  : "在「模组 → 资源库」里按版本挑 Mod；装完重启服务器生效。"}
              </span>
            </li>
            <li className="flex items-start gap-2 t-label-13 text-gray-900">
              <Users className="mt-0.5 size-4 shrink-0 text-gray-700" />
              <span>把自己加为 OP、或开启白名单，在「玩家」页一站式管理。</span>
            </li>
            <li className="flex items-start gap-2 t-label-13 text-gray-900">
              <HardDrive className="mt-0.5 size-4 shrink-0 text-gray-700" />
              <span>想开新维度？「世界」页可以生成超平坦、虚空等自定义世界的数据包。</span>
            </li>
          </ul>
        </Card>
      </div>
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Timer className="size-4 text-gray-800" />
          <h3 className="t-h-14 text-gray-1000">自动化</h3>
          <span className="t-label-12 text-gray-700">只在这个实例运行中生效</span>
        </div>

        {!isDesktopVisual() ? (
          <div className="rounded-lg bg-amber-700/10 p-3 t-label-13 text-amber-900">
            定时重启、定时公告、定时备份需要桌面版常驻进程；网页版现在不会触发。
            先用桌面版设置，或者手动在控制台操作。
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="每日重启" hint={schedule.restartAt ? `每天 ${schedule.restartAt} 自动重启` : "留空不重启"}>
            <div className="flex gap-2">
              <Input
                type="time"
                value={schedule.restartAt ?? ""}
                onChange={(e) => saveSchedule({ ...schedule, restartAt: e.target.value })}
              />
              {schedule.restartAt ? (
                <Button size="sm" variant="ghost" onClick={() => saveSchedule({ ...schedule, restartAt: "" })}>
                  清除
                </Button>
              ) : null}
            </div>
          </Field>

          <Field label="定时公告" hint={schedule.broadcastEvery ? `每 ${schedule.broadcastEvery} 分钟广播一次` : "关闭"}>
            <div className="space-y-1.5">
              <Picker
                value={String(schedule.broadcastEvery ?? 0)}
                onValueChange={(v) => saveSchedule({ ...schedule, broadcastEvery: Number(v) })}
                options={[
                  { value: "0", label: "关闭" },
                  { value: "30", label: "每 30 分钟" },
                  { value: "60", label: "每 1 小时" },
                  { value: "120", label: "每 2 小时" },
                ]}
              />
              {schedule.broadcastEvery ? (
                <Input
                  value={schedule.broadcastText ?? ""}
                  onChange={(e) => saveSchedule({ ...schedule, broadcastText: e.target.value })}
                  placeholder="宣传语，例如：欢迎加入 QQ 群"
                />
              ) : null}
            </div>
          </Field>

          <Field label="定时备份" hint={schedule.backupEvery ? `每 ${schedule.backupEvery} 分钟备份一次` : "关闭"}>
            <Picker
              value={String(schedule.backupEvery ?? 0)}
              onValueChange={(v) => saveSchedule({ ...schedule, backupEvery: Number(v) })}
              options={[
                { value: "0", label: "关闭" },
                { value: "30", label: "每 30 分钟" },
                { value: "60", label: "每 1 小时" },
                { value: "180", label: "每 3 小时" },
              ]}
            />
          </Field>
        </div>
        )}
      </Card>
      </div>

      <InviteDialog open={inviting} onOpenChange={setInviting} instance={instance} />
    </>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-1.5 text-gray-700">
        {icon}
        <span className="t-label-12">{label}</span>
      </div>
      <div className="t-mono-13 mt-1.5 text-gray-1000">{value}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="t-label-12 shrink-0 text-gray-700">{label}</dt>
      <dd className="t-label-13 min-w-0 text-right text-gray-1000">{value}</dd>
    </div>
  );
}
