import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, FileText, Puzzle, HardDrive, Clock, Users, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { useServer } from "@/stores/server";
import type { Instance } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/utils";

export function InstanceOverview({ instance, onEdit }: { instance: Instance; onEdit: () => void }) {
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const players = useServer((s) => s.players);
  const memoryUsed = useServer((s) => s.memoryUsed);
  const setMemory = useServer((s) => s.setMemory);
  const [now, setNow] = useState(Date.now());
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
        window.mcss.worlds.scan(instance.dir).catch(() => []),
      ]);
      if (alive) setCounts({ mods: mods.length, worlds: worlds.reduce((n, p) => n + p.worlds.length, 0) });
    })();
    return () => {
      alive = false;
    };
  }, [instance.dir]);

  const uptime = running && startedAt ? Math.floor((now - startedAt) / 1000) : 0;

  return (
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
              <span>在「Mod」页安装 Mod，或从资源库挑现成的整合；装完记得重启服务器。</span>
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
    </div>
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
