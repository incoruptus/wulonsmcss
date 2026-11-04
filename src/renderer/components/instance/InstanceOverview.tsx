import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  FolderOpen, FileText, Puzzle, HardDrive, Clock, Users, Cpu, Send, Timer,
  ArrowUpRight, Info,
} from "lucide-react";
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
import { useI18n } from "@/i18n";

export function InstanceOverview({ instance, onEdit }: { instance: Instance; onEdit: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const players = useServer((s) => s.players);
  const memoryUsed = useServer((s) => s.memoryUsed);
  const setMemory = useServer((s) => s.setMemory);
  const updateInstance = useConfig((s) => s.updateInstance);
  const [now, setNow] = useState(Date.now());
  const [inviting, setInviting] = useState(false);
  const [schedule, setSchedule] = useState<InstanceSchedule>(instance.schedule ?? {});
  const [counts, setCounts] = useState<{ mods: number; worlds: number }>({ mods: 0, worlds: 0 });
  const running = status === "running" || status === "starting";

  function saveSchedule(next: InstanceSchedule) {
    setSchedule(next);
    void updateInstance(instance.id, { schedule: next });
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      const bytes = await window.mcss.server.memory().catch(() => 0);
      if (alive && bytes > 0) setMemory(bytes);
    };
    void tick();
    const timer = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [running, setMemory]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [mods, worlds] = await Promise.all([
        window.mcss.mods.scan(`${instance.dir}\\mods`).catch(() => []),
        worldsApi.scan(instance.dir).catch(() => []),
      ]);
      if (alive) setCounts({ mods: mods.length, worlds: worlds.reduce((n, pack) => n + pack.worlds.length, 0) });
    })();
    return () => { alive = false; };
  }, [instance.dir]);

  const uptime = running && startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const contentLabel = contentKindOf(serverTypeOf(instance)) === "plugin" ? t("overview.content.plugin", "插件") : t("overview.content.mod", "模组");

  return (
    <>
      <div className="space-y-5">
        <Card className="grid grid-cols-2 overflow-hidden p-0 lg:grid-cols-4">
          <Metric icon={<Clock />} label={t("overview.metric.uptime", "运行时长")} value={running ? formatDuration(uptime) : t("overview.metric.notRunning", "未运行")} />
          <Metric icon={<Users />} label={t("overview.metric.players", "在线玩家")} value={running ? t("overview.metric.playerCount", "{n} 人", { n: players.length }) : "—"} />
          <Metric icon={<Cpu />} label={t("overview.metric.memory", "内存")} value={running && memoryUsed ? `${(memoryUsed / 1024 ** 3).toFixed(1)} / ${instance.memoryMax} GB` : t("overview.metric.memoryCap", "上限 {gb} GB", { gb: instance.memoryMax })} />
          <Metric icon={<HardDrive />} label={t("overview.metric.content", "内容与世界")} value={contentKindOf(serverTypeOf(instance)) === "plugin" ? t("overview.contentValue.plugin", "{mods} 个插件 · {worlds} 个世界", { mods: counts.mods, worlds: counts.worlds }) : t("overview.contentValue.mod", "{mods} 个模组 · {worlds} 个世界", { mods: counts.mods, worlds: counts.worlds })} />
        </Card>

        <div className="grid items-start gap-5 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <SectionHead icon={<Send />} title={t("overview.invite.title", "邀请朋友来玩")} desc={t("overview.invite.desc", "先确认哪条线路能用，再把地址发给朋友。")} />
            <div className="mt-5"><ReachabilityPanel port={instance.port} onInvite={() => setInviting(true)} /></div>
          </Card>

          <Card className="xl:col-span-5">
            <SectionHead icon={<Info />} title={t("overview.info.title", "服务器信息")} desc={t("overview.info.desc", "当前服务器的基本配置。")} />
            <dl className="mt-4 divide-y divide-gray-300">
              <Row label={t("overview.info.version", "版本")} value={`${instance.mcVersion} · ${instance.loader}${instance.loaderVersion ? ` ${instance.loaderVersion}` : ""}`} />
              <Row label={t("overview.info.memory", "内存")} value={`${instance.memoryMin}–${instance.memoryMax} GB`} />
              <Row label={t("overview.info.port", "端口")} value={String(instance.port)} />
              <Row label={t("overview.info.lastStart", "上次启动")} value={instance.lastStartedAt ? timeAgo(instance.lastStartedAt) : t("overview.info.neverStarted", "从未启动")} />
              <Row label={t("overview.info.dir", "目录")} value={<span className="t-mono-12 break-all" title={instance.dir}>{instance.dir}</span>} />
              <Row label={t("overview.info.java", "Java")} value={<span className="t-mono-12 break-all" title={instance.javaPath || t("overview.info.javaUnset", "未指定")}>{instance.javaPath || t("overview.info.javaAuto", "自动选择")}</span>} />
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.mcss.app.openPath(instance.dir)}><FolderOpen className="size-3.5" />{t("overview.openDir", "打开目录")}</Button>
              <Button variant="secondary" size="sm" onClick={onEdit}>{t("overview.edit", "编辑设置")}</Button>
              <Button variant="ghost" size="sm" onClick={async () => {
                const path = `${instance.dir}\\server.properties`;
                const exists = await window.mcss.fs.exists(path).catch(() => false);
                if (!exists) return toast.error(t("overview.noConfig", "还没有配置文件"), { description: t("overview.noConfigDesc", "先启动一次服务器，再打开 server.properties。") });
                await window.mcss.app.openPath(path);
              }}><FileText className="size-3.5" />{t("overview.openConfig", "打开配置文件")}</Button>
            </div>
          </Card>
        </div>

        <Card>
          <SectionHead icon={<Puzzle />} title={t("overview.next.title", "接下来可以做")} desc={t("overview.next.desc", "无需一次配置完成，可按实际需要逐步设置。")} />
          <div className="mt-4 grid gap-2 lg:grid-cols-3">
            <NextStep
              title={t("overview.next.install", "装点{label}", { label: contentLabel })}
              desc={contentKindOf(serverTypeOf(instance)) === "plugin" ? t("overview.next.installPluginDesc", "领地、传送、经济类插件安装后需重启生效。") : t("overview.next.installModDesc", "按游戏版本筛选，安装后需重启生效。")}
              onClick={() => navigate(`/instances/${instance.id}/content?view=browse`)}
            />
            <NextStep title={t("overview.next.players", "管理玩家")} desc={t("overview.next.playersDesc", "设置管理员（OP）、白名单与封禁名单。")} onClick={() => navigate(`/instances/${instance.id}/players`)} />
            <NextStep title={t("overview.next.worlds", "照顾世界")} desc={t("overview.next.worldsDesc", "创建新维度，或留一份备份。")} onClick={() => navigate(`/instances/${instance.id}/worlds`)} />
          </div>
        </Card>

        <Card>
          <SectionHead icon={<Timer />} title={t("overview.auto.title", "自动化")} desc={t("overview.auto.desc", "按设定周期自动执行任务，仅在服务器运行期间生效。")} />
          {!isDesktopVisual() ? (
            <div className="mt-5 rounded-lg bg-amber-700/10 p-3.5 t-copy-13 text-amber-900">
              {t("overview.auto.webDesc", "定时任务需要桌面版常驻运行，网页版可查看设置，但不会自动触发。")}
            </div>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <Field label={t("overview.auto.restart", "每日重启")} hint={schedule.restartAt ? t("overview.auto.restartHint", "每天 {time} 自动重启", { time: schedule.restartAt }) : t("overview.auto.restartOff", "不设置时间就不会自动重启")} htmlFor="schedule-restart">
                <div className="flex gap-2">
                  <Input id="schedule-restart" type="time" value={schedule.restartAt ?? ""} onChange={(event) => saveSchedule({ ...schedule, restartAt: event.target.value })} />
                  {schedule.restartAt ? <Button size="sm" variant="ghost" onClick={() => saveSchedule({ ...schedule, restartAt: "" })}>{t("overview.auto.clear", "清除")}</Button> : null}
                </div>
              </Field>
              <Field label={t("overview.auto.broadcast", "定时公告")} hint={schedule.broadcastEvery ? t("overview.auto.broadcastHint", "每 {n} 分钟发送一次", { n: schedule.broadcastEvery }) : t("overview.auto.off", "当前已关闭")}>
                <div className="space-y-2">
                  <Picker value={String(schedule.broadcastEvery ?? 0)} onValueChange={(value) => saveSchedule({ ...schedule, broadcastEvery: Number(value) })} options={[
                    { value: "0", label: t("overview.auto.close", "关闭") }, { value: "30", label: t("overview.auto.every30", "每 30 分钟") }, { value: "60", label: t("overview.auto.every1h", "每 1 小时") }, { value: "120", label: t("overview.auto.every2h", "每 2 小时") },
                  ]} />
                  {schedule.broadcastEvery ? <Input value={schedule.broadcastText ?? ""} onChange={(event) => saveSchedule({ ...schedule, broadcastText: event.target.value })} placeholder={t("overview.auto.broadcastPlaceholder", "例如：欢迎回来，记得看群公告")} /> : null}
                </div>
              </Field>
              <Field label={t("overview.auto.backup", "定时备份")} hint={schedule.backupEvery ? t("overview.auto.backupHint", "每 {n} 分钟备份一次", { n: schedule.backupEvery }) : t("overview.auto.off", "当前已关闭")}>
                <Picker value={String(schedule.backupEvery ?? 0)} onValueChange={(value) => saveSchedule({ ...schedule, backupEvery: Number(value) })} options={[
                  { value: "0", label: t("overview.auto.close", "关闭") }, { value: "30", label: t("overview.auto.every30", "每 30 分钟") }, { value: "60", label: t("overview.auto.every1h", "每 1 小时") }, { value: "180", label: t("overview.auto.every3h", "每 3 小时") },
                ]} />
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
    <div className="border-gray-300 p-4 odd:border-r sm:p-5 lg:border-r lg:last:border-r-0">
      <div className="flex items-center gap-2 text-gray-700"><span className="[&>svg]:size-4">{icon}</span><span className="t-label-12">{label}</span></div>
      <div className="t-mono-13 mt-2 truncate font-medium text-gray-1000" title={value}>{value}</div>
    </div>
  );
}

function SectionHead({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-brand-600 [&>svg]:size-[18px]">{icon}</span>
      <div><h3 className="t-h-16 text-gray-1000">{title}</h3><p className="t-copy-13 mt-1 text-gray-800">{desc}</p></div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="t-label-12 shrink-0 pt-0.5 text-gray-700">{label}</dt>
      <dd className="t-label-13 min-w-0 max-w-[75%] text-right text-gray-1000">{value}</dd>
    </div>
  );
}

function NextStep({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-3 rounded-lg bg-background-200 p-3.5 text-left transition-colors hover:bg-gray-100">
      <span className="min-w-0 flex-1"><span className="t-label-13 block font-medium text-gray-1000">{title}</span><span className="mt-1 block text-[12px] leading-[18px] text-gray-700">{desc}</span></span>
      <ArrowUpRight className="size-4 shrink-0 text-gray-700 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </button>
  );
}
