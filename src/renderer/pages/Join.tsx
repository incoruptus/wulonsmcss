import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Gamepad2,
  Package,
  Play,
  Server,
  Users,
} from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import { decodeRoom, extractCode, type RoomDescriptorV1 } from "@/lib/room";
import { copyText, safeName } from "@/lib/utils";

interface Exported {
  file: string;
  size: number;
  mods: number;
}

export default function Join() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [room, setRoom] = useState<RoomDescriptorV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [launchers, setLaunchers] = useState<{ name: string; path: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number; detail?: string } | null>(null);
  const [exported, setExported] = useState<Exported | null>(null);
  const [preparedDir, setPreparedDir] = useState<string | null>(null);

  useEffect(() => {
    window.mcss.app.detectLaunchers?.().then(setLaunchers).catch(() => {});
  }, []);

  async function load(raw: string) {
    if (!raw.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setRoom(await decodeRoom(raw));
      setExported(null);
      setPreparedDir(null);
    } catch (e) {
      setRoom(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (code) {
      setInput(code);
      void load(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** 主路径：生成进服包 → 打开文件夹 → 打开启动器 */
  async function prepareAndPlay() {
    if (!room) return;
    if (!room.mods.length) {
      (await copyText(room.addr)) ? toast.success("地址已复制") : toast.error("复制失败");
      if (launchers[0]) window.mcss.app.openPath(launchers[0].path);
      return;
    }
    setBusy(true);
    setProgress({ stage: "打包进服包", percent: 0 });
    const off = window.mcss.client.onProgress(setProgress);
    try {
      const info = await window.mcss.app.info();
      const dir = `${info.documents}\\MCSS\\进服包`;
      const file = `${dir}\\${safeName(room.name)}.mrpack`;
      const res = await window.mcss.client.exportMrpack({ outFile: file, room });
      if (!res.ok) throw new Error(res.error || "导出失败");
      setExported({ file: res.file ?? file, size: res.size ?? 0, mods: res.mods ?? 0 });
      void window.mcss.app.openPath(dir);
      if (launchers[0]) window.mcss.app.openPath(launchers[0].path);
      toast.success("进服包已生成", { description: "在启动器里导入它，就能直接进服" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      off();
      setBusy(false);
      setProgress(null);
    }
  }

  /** 旁路：把 Mod 直接装进现有客户端，并把服务器写进多人列表 */
  async function installIntoClient() {
    if (!room) return;
    const dir = await window.mcss.dialog.openDirectory();
    if (!dir) return;
    setBusy(true);
    setProgress({ stage: "准备中", percent: 0 });
    const off = window.mcss.client.onProgress(setProgress);
    try {
      if (room.mods.length) {
        const res = await window.mcss.client.prepare({ dir, mods: room.mods });
        if (!res.ok) throw new Error(res.error || res.results?.find((r) => !r.ok)?.error || "准备失败");
        setPreparedDir(res.modsDir ?? dir);
      }
      const added = await window.mcss.client.addServer({ mcDir: dir, name: room.name, ip: room.addr });
      if (!added.ok) throw new Error(added.error || "写入服务器列表失败");
      toast.success("客户端已备好", {
        description: room.mods.length ? `${room.mods.length} 个 Mod + 服务器列表` : "服务器列表已写入",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      off();
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <PageHeader
        title="加入房间"
        desc="朋友发来的链接或房间码，粘进来就能看到要准备什么。"
        actions={room ? <Button variant="secondary" onClick={() => navigate("/")}>回到概览</Button> : undefined}
      />
      <PageBody className="max-w-3xl space-y-4">
        {!room ? (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-gray-800" />
                <span className="t-h-14 text-gray-1000">粘贴邀请链接 / 房间码</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load(input)}
                  placeholder="https://…/join/w1z… 或 w1z.a1b2c3.…"
                  className="font-mono text-[12.5px]"
                />
                <Button onClick={() => load(input)} loading={loading}>
                  打开
                </Button>
              </div>
              {error ? (
                <div className="flex items-start gap-2 rounded-lg bg-red-700/10 p-2.5 t-label-12 text-red-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </div>
              ) : null}
              <p className="t-label-12 text-gray-700">
                链接里带着服务器地址、版本和需要的 Mod，不经过我们的服务器；房间码被改坏或过期会直接报错。
              </p>
            </div>
          </Card>
        ) : (
          <Card className="space-y-4">
            {/* 房间头 */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="green" size="sm">邀请有效</Badge>
                  <span className="t-label-12 text-gray-700">{room.mc} · {room.loader}</span>
                </div>
                <h2 className="t-h-24 mt-1.5 text-gray-1000">{room.name}</h2>
                <p className="t-mono-12 mt-0.5 text-gray-700">{room.addr}</p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  (await copyText(room.addr)) ? toast.success("地址已复制") : toast.error("复制失败");
                }}
              >
                <Copy className="size-4" />
                复制地址
              </Button>
            </div>

            {/* 三个事实 */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Info icon={<Server className="size-3.5" />} label="版本" value={`${room.mc} · ${room.loader}`} />
              <Info
                icon={<Package className="size-3.5" />}
                label="需要的 Mod"
                value={room.mods.length ? `${room.mods.length} 个` : "无需额外 Mod"}
              />
              <Info
                icon={<Gamepad2 className="size-3.5" />}
                label="本机启动器"
                value={launchers.length ? launchers[0].name : "未检测到"}
              />
            </div>

            {/* 主路径 */}
            <div className="rounded-xl bg-background-100 p-3 shadow-geist-border">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={prepareAndPlay} loading={busy} disabled={busy}>
                  {room.mods.length ? <Package className="size-4" /> : <Play className="size-4" />}
                  {room.mods.length ? "准备进游戏" : "复制地址并打开启动器"}
                  <ArrowRight className="size-4" />
                </Button>
                <span className="t-label-12 text-gray-700">
                  {room.mods.length
                    ? "生成一个进服包并打开启动器，导入后服务器已在列表里"
                    : "这个房间不需要额外 Mod，进游戏加地址即可"}
                </span>
              </div>

              {progress ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between t-label-12 text-gray-800">
                    <span>{progress.stage}</span>
                    <span className="t-mono-12">{progress.detail || `${progress.percent}%`}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                    <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${Math.max(2, progress.percent)}%` }} />
                  </div>
                </div>
              ) : null}

              {exported ? (
                <div className="mt-3 rounded-lg bg-green-800/10 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-green-900" />
                    <span className="t-label-13 font-medium text-green-900">进服包已就绪</span>
                    <span className="t-mono-12 truncate text-gray-700">{exported.file}</span>
                  </div>
                  <ol className="mt-1 space-y-0.5 t-label-12 text-gray-800">
                    <li>1. 在启动器里点「导入整合包」，选刚生成的文件</li>
                    <li>2. 启动游戏，服务器已经在多人列表：<span className="t-mono-12">{room.addr}</span></li>
                  </ol>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openPath(exported.file.replace(/[\\/][^\\/]+$/, ""))}>
                      打开所在文件夹
                    </Button>
                    {launchers[0] ? (
                      <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openPath(launchers[0].path)}>
                        打开 {launchers[0].name}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Mod 清单 */}
            {room.mods.length ? (
              <div className="rounded-lg bg-background-100 p-3 shadow-geist-border">
                <div className="flex items-center justify-between">
                  <div className="t-label-13 font-medium text-gray-1000">这个房间需要这些 Mod（{room.mods.length}）</div>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      const text = room.mods.map((m) => m.n ?? m.p).join("\n");
                      (await copyText(text)) ? toast.success("Mod 清单已复制") : toast.error("复制失败");
                    }}
                  >
                    <Copy className="size-3" />
                    复制清单
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {room.mods.map((m) => (
                    <Badge key={m.p + m.v} variant="gray" size="sm">{m.n ?? m.p}</Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 旁路 */}
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-300 pt-3">
              <Button size="sm" variant="secondary" onClick={installIntoClient} disabled={busy}>
                <Download className="size-3.5" />
                装进现有客户端
              </Button>
              <span className="t-label-12 text-gray-700">
                不想新建实例？选你的 <span className="t-mono-12">.minecraft</span>，Mod 和服务器列表一起写好
              </span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setRoom(null); setInput(""); }}>
                换一个房间码
              </Button>
            </div>

            {preparedDir ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-green-800/10 p-3">
                <CheckCircle2 className="size-4 text-green-900" />
                <span className="t-label-12 text-green-900">已写入</span>
                <span className="t-mono-12 truncate text-gray-900">{preparedDir}</span>
                <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openPath(preparedDir)}>
                  打开目录
                </Button>
              </div>
            ) : null}

            <p className="t-label-12 text-gray-700">
              版本不对会连不上：本机客户端需要 {room.mc} + {room.loader}。
            </p>
          </Card>
        )}

        {room?.note ? (
          <Card>
            <div className="t-label-12 text-gray-700">服主留言</div>
            <div className="t-label-13 mt-1 whitespace-pre-wrap text-gray-1000">{room.note}</div>
          </Card>
        ) : null}

        {!room && !error ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="还没有邀请"
            desc="让服主在「邀请朋友」里生成一条链接，发给你就行。"
            className="py-10"
          />
        ) : null}
      </PageBody>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background-100 p-2.5 shadow-geist-border">
      <div className="flex items-center gap-1.5 text-gray-700">
        {icon}
        <span className="t-label-12">{label}</span>
      </div>
      <div className="t-label-13 mt-1 text-gray-1000">{value}</div>
    </div>
  );
}
