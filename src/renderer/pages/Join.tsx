import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
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
import { Badge, Card } from "@/components/ui/misc";
import { decodeRoom, extractCode, type RoomDescriptorV1 } from "@/lib/room";
import { chooseBest, kindLabel, parseAddr } from "@/lib/reach";
import { useRoomReach } from "@/hooks/useReach";
import { checkClient, defaultClientDir, type CheckupResult } from "@/lib/checkup";
import { buildDiagnostic, encodeDiagnostic } from "@/lib/diagnose";
import { planFromDisk, type DiskPlan } from "@/lib/launch";
import { copyText, cx, safeName } from "@/lib/utils";
import { useConfig } from "@/stores/config";
import { serverTypeLabel } from "@/lib/config-model";

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
  const [clientDir, setClientDir] = useState<string>("");
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("mcss.playerName") || "Steve";
    } catch {
      return "";
    }
  });
  const [checkup, setCheckup] = useState<CheckupResult | null>(null);
  const [plan, setPlan] = useState<DiskPlan | null>(null);
  // 多条候选地址并发探测，玩家不用知道哪条是内网、哪条是隧道
  const { report: reach, checking: reaching, refresh: refreshReach } = useRoomReach(room);
  const best = chooseBest(reach?.probes ?? []);
  const effectiveAddr = best?.addr ?? room?.addr ?? "";
  const usingLan = best?.target.kind === "lan";
  const saveServer = useConfig((s) => s.saveServer);

  // 打开一个房间就记到「我的服务器」：玩家下次不用再翻聊天记录找地址
  useEffect(() => {
    if (!room || !effectiveAddr) return;
    const parsed = parseAddr(effectiveAddr);
    if (!parsed) return;
    const { host: address, port } = parsed;
    // 同一个地址重复进不新增记录，只更新上次进入时间
    const existing = useConfig
      .getState()
      .cfg.savedServers.find((s) => s.address === address && Number(s.port || 25565) === Number(port || 25565));
    void saveServer({
      id: existing?.id,
      name: room.name,
      address,
      port,
      mcVersion: room.mc,
      loader: room.loader,
      fromRoom: code,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.name, room?.mc, room?.loader, effectiveAddr, code]);

  // 房间一确定就体检：读本地 .minecraft，回答「能不能直接进」
  useEffect(() => {
    if (!room) {
      setCheckup(null);
      return;
    }
    let alive = true;
    void (async () => {
      const info = await window.mcss.app.info().catch(() => null);
      if (!info) return;
      // 桌面版 appData 是 %APPDATA%\wulons-mcss，不能直接拼 .minecraft；
      // 主进程给 minecraftDir，老 agent 没这个字段时再退回 defaultClientDir。
      const savedProfile = useConfig.getState().cfg.clientProfiles?.[0]?.dir;
      const dir = clientDir || savedProfile || info.minecraftDir || defaultClientDir(info.appData);
      if (!clientDir) {
        setClientDir(dir);
        return;
      }
      const result = await checkClient(dir, room).catch(() => null);
      if (alive) setCheckup(result);
    })();
    return () => {
      alive = false;
    };
  }, [room, clientDir]);

  async function pickClientDir() {
    const picked = await window.mcss.dialog.openDirectory();
    if (picked) {
      setCheckup(null);
      setClientDir(picked);
    }
  }

  // 体检通过时再算一份「直接进游戏」的计划（复用玩家启动器已装好的版本）
  useEffect(() => {
    if (!room || !checkup || checkup.verdict !== "ready" || !clientDir) {
      setPlan(null);
      return;
    }
    let alive = true;
    void (async () => {
      const javas = await window.mcss.app.detectJava().catch(() => []);
      const javaPath = javas[0]?.path ?? "java";
      const result = await planFromDisk({
        mcDir: clientDir,
        room: { mc: room.mc, loader: room.loader, addr: effectiveAddr },
        username: username.trim() || "Steve",
        javaPath,
        memoryGb: { min: 2, max: 4 },
      }).catch(() => null);
      if (alive) setPlan(result);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, checkup, clientDir, effectiveAddr, username]);

  useEffect(() => {
    try {
      localStorage.setItem("mcss.playerName", username.trim());
    } catch {}
  }, [username]);

  const canLaunch = Boolean(plan && plan.command.length > 0 && plan.missing.length === 0 && username.trim());

  async function launchNow() {
    if (!plan?.command.length) return;
    const res = await window.mcss.client.launch({ command: plan.command, cwd: clientDir });
    if (res.ok) toast.success("游戏已启动，正在连接服务器…");
    else
      toast.error("启动失败", {
        description: `${res.error || "未知错误"}。若服务器要求正版登录，请使用下方的进服包从启动器进入。`,
      });
  }

  // 一键准备好：从 mcss://install/<code> 进来的，体检一出来就自己动手，不再让人找按钮
  const autoRun = useRef(false);
  // 注意：路由是 Hash 模式，`?auto=1` 在 # 之后，得从 hash 里取
  const autoRequested = (() => {
    if (typeof window === "undefined") return false;
    const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
    const params = new URLSearchParams(hashQuery || window.location.search);
    return params.get("auto") === "1";
  })();
  useEffect(() => {
    if (!autoRequested || !room || !checkup || autoRun.current) return;
    autoRun.current = true;
    if (checkup.verdict === "ready") {
      if (launchers[0]) void window.mcss.app.openPath(launchers[0].path);
      toast.success("客户端已就绪，启动器已打开", { description: `选 ${checkup.match ?? room.mc} 这个实例就能进` });
      return;
    }
    void prepareAndPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequested, room, checkup]);

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
      // 路由参数里可能带着 hash 查询串（?auto=1），先剥掉再解码
      const clean = code.split("?")[0];
      setInput(clean);
      void load(clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** 主路径：生成进服包 → 打开文件夹 → 打开启动器 */
  async function prepareAndPlay() {
    if (!room) return;
    if (!room.mods.length) {
      (await copyText(effectiveAddr)) ? toast.success("地址已复制") : toast.error("复制失败");
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
      const res = await window.mcss.client.exportMrpack({ outFile: file, room: { ...room, addr: effectiveAddr } });
      if (!res.ok) throw new Error(res.error || "导出失败");
      setExported({ file: res.file ?? file, size: res.size ?? 0, mods: res.mods ?? 0 });
      void window.mcss.app.openPath(dir);
      if (launchers[0]) window.mcss.app.openPath(launchers[0].path);
      toast.success("进服包已生成", { description: "在启动器中导入后即可直接进入服务器" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      off();
      setBusy(false);
      setProgress(null);
    }
  }

  /** 进不去时把「房间 + 探测 + 客户端体检」压成一段码，服主粘贴就能还原现场 */
  async function copyDiagnostic() {
    if (!room) return;
    try {
      const code = await encodeDiagnostic(buildDiagnostic({ room, reach, checkup, launchers }));
      if (await copyText(code)) {
        toast.success("诊断已复制", { description: "发送给服主，粘贴后即可看到你的连接情况" });
      } else {
        toast.error("复制失败，请手动选中");
      }
    } catch (e) {
      toast.error((e as Error).message);
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
      const added = await window.mcss.client.addServer({ mcDir: dir, name: room.name, ip: effectiveAddr });
      if (!added.ok) throw new Error(added.error || "写入服务器列表失败");
      toast.success("客户端已备好", {
        description: room.mods.length ? `${room.mods.length} 个模组与服务器列表` : "服务器列表已写入",
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
        className="max-w-4xl"
        title="加入游戏"
        desc="粘贴朋友发来的邀请，开服茶会先检查版本、模组与连接方式。"
        actions={room ? <Button variant="secondary" onClick={() => { setRoom(null); setInput(""); setError(null); navigate("/"); }}>换个房间</Button> : undefined}
      />
      <PageBody className="max-w-4xl space-y-5">
        {!room ? (
          <Card className="panel-wash p-6 sm:p-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="brand-mark grid size-11 place-items-center rounded-xl"><Users className="size-5" /></span>
                <div><h2 className="t-h-20 text-gray-1000">加入朋友的世界，一条邀请即可</h2><p className="t-copy-13 mt-1 text-gray-800">支持完整的邀请链接与房间码。</p></div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load(input)}
                  placeholder="https://…/join/w1z… 或 w1z.a1b2c3.…"
                  aria-label="邀请链接或房间码"
                  className="h-11 font-mono text-[12.5px]"
                />
                <Button variant="accent" size="lg" onClick={() => load(input)} loading={loading} disabled={!input.trim()}>
                  打开邀请
                </Button>
              </div>
              {error ? (
                <div className="flex items-start gap-2 rounded-lg bg-red-700/10 p-2.5 t-label-12 text-red-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </div>
              ) : null}
              <p className="t-copy-13 text-gray-700">
                邀请中仅包含服务器地址、游戏版本与所需模组，无需注册账号；链接损坏或过期时会给出具体原因。
              </p>
            </div>
          </Card>
        ) : (
          <Card className="space-y-5 p-5 sm:p-6">
            {/* 房间头 */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="green" size="sm">邀请有效</Badge>
                  <span className="t-label-12 text-gray-700">
                    {room.mc} · {serverTypeLabel((room.loader || "vanilla") as never)}
                  </span>
                </div>
                <h2 className="t-h-24 mt-1.5 text-gray-1000">{room.name}</h2>
                <p className="t-mono-12 mt-0.5 text-gray-700">
                  {effectiveAddr || "还没有地址"}
                  {best ? (
                    <span className="ml-2 rounded bg-green-800/12 px-1.5 py-0.5 t-label-12 text-green-900">
                      {usingLan ? "同 WiFi 直连" : best.target.kind === "tunnel" ? "走隧道" : "公网直连"} · {best.ms ?? 0}ms
                    </span>
                  ) : room.lan && !reaching ? (
                    <span className="ml-2 t-label-12 text-gray-700">（内网地址不可用，已改用公网）</span>
                  ) : null}
                </p>

                {/* 多条候选地址都探一遍，走通哪条就说哪条 */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {reaching ? (
                    <span className="t-label-12 text-gray-700">正在探测地址…</span>
                  ) : best ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-800/12 px-2 py-0.5 t-label-12 text-green-900">
                      <span className="size-1.5 rounded-full bg-green-900" />
                      在线 {best.players?.online ?? 0}/{best.players?.max ?? 0} 人
                      <span className="text-green-900/70">· {kindLabel(best.target.kind)}</span>
                    </span>
                  ) : reach?.probes.length ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-300/40 px-2 py-0.5 t-label-12 text-gray-700">
                      <span className="size-1.5 rounded-full bg-gray-700" />
                      当前未连接成功，服务器可能未启动，或双方不在同一网络
                    </span>
                  ) : null}
                  <Button size="xs" variant="ghost" onClick={() => void refreshReach()}>
                    刷新
                  </Button>
                </div>
                {best?.motd ? (
                  <p className="t-label-12 mt-1 line-clamp-2 text-gray-800">{best.motd}</p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  (await copyText(effectiveAddr)) ? toast.success("地址已复制") : toast.error("复制失败");
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

            {/* 客户端体检 */}
            {checkup ? (
              <div
                className={cx(
                  "rounded-lg p-3",
                  checkup.verdict === "ready" ? "bg-green-800/10" : "bg-background-100 shadow-geist-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {checkup.verdict === "ready" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-900" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-amber-900" />
                  )}
                  <span className={cx("t-label-13 font-medium", checkup.verdict === "ready" ? "text-green-900" : "text-gray-1000")}>
                    {checkup.verdict === "ready"
                      ? "客户端版本与模组均已齐全"
                      : checkup.verdict === "need-mods"
                        ? `游戏版本匹配，但本地缺少 ${checkup.mods.missing.length} 个模组`
                        : checkup.verdict === "need-version"
                          ? `没有 ${room.mc} · ${room.loader} 的实例`
                          : checkup.verdict === "no-version"
                            ? "该 .minecraft 目录中尚未安装游戏"
                            : "没找到 .minecraft"}
                  </span>
                  <Button size="xs" variant="ghost" className="ml-auto" onClick={pickClientDir}>
                    换个目录
                  </Button>
                </div>

                <p className="t-label-12 mt-1 text-gray-800">
                  {checkup.verdict === "ready"
                    ? `已找到 ${checkup.match}，房间所需的模组齐备（${checkup.mods.present}/${checkup.mods.total}），可直接启动，也可在启动器中选择该服务器。`
                    : checkup.verdict === "need-mods"
                      ? `缺少：${checkup.mods.missing.map((m) => m.n).slice(0, 6).join("、")}${checkup.mods.missing.length > 6 ? " 等" : ""}。使用下方的进服包更省事，不会影响现有客户端。`
                      : checkup.verdict === "need-version"
                        ? `现有：${checkup.candidates.map((c) => c.id).slice(0, 5).join("、") || "（无）"}。使用进服包会在启动器中新建一个对应的服务器实例。`
                        : checkup.verdict === "no-version"
                          ? "当前环境尚未通过启动器安装游戏。使用进服包更省事，导入后即可得到现成的服务器实例。"
                          : "请选择你的 .minecraft 目录，以便检查版本与模组是否齐全。"}
                </p>
              </div>
            ) : null}

            {/* 服务器没响应时先说清楚，不让人启动完才发现连不上 */}
            {!best && reach && reach.probes.some((p) => p.checked) ? (
              <div className="flex flex-wrap items-start gap-2 rounded-lg bg-amber-700/10 p-3 t-label-12 text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  服务器当前无响应，可能尚未启动，或双方不在同一网络。可先准备好进服包，待服主开服后再进入。
                </span>
                <Button size="xs" variant="secondary" className="shrink-0" onClick={copyDiagnostic}>
                  <ClipboardCopy className="size-3" />
                  复制诊断
                </Button>
              </div>
            ) : null}

            {/* 主路径 */}
            <div className="rounded-xl bg-brand-100 p-4">
              <div className="flex flex-wrap items-center gap-3">
                {canLaunch ? (
                  <Button size="lg" variant="accent" onClick={launchNow}>
                    <Play className="size-4" />
                    直接进游戏（离线）
                    <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button size="lg" variant="accent" onClick={prepareAndPlay} loading={busy} disabled={busy}>
                    {room.mods.length ? <Package className="size-4" /> : <Play className="size-4" />}
                    {room.mods.length ? "准备进游戏" : "复制地址并打开启动器"}
                    <ArrowRight className="size-4" />
                  </Button>
                )}
                <span className="t-label-12 text-gray-700">
                  {canLaunch
                    ? `使用已安装的 ${plan?.versionId} 启动，直接连接 ${effectiveAddr}`
                    : room.mods.length
                      ? "生成进服包并打开启动器，导入后服务器已添加到列表"
                      : "该房间无需额外模组，进入游戏后添加地址即可"}
                </span>
              </div>

              {canLaunch ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-background-200 px-3 py-2">
                  <span className="t-label-12 shrink-0 text-gray-700">游戏内名字</span>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^0-9A-Za-z_]/g, "").slice(0, 16))}
                    onBlur={() => !username.trim() && setUsername("Steve")}
                    className="h-7 w-[150px] font-mono text-[12px]"
                    aria-label="离线用户名"
                  />
                  <span className="t-label-12 text-gray-700">
                    离线启动仅适用于已关闭正版验证的服务器；若无法进入，请使用下方的进服包从启动器登录。
                  </span>
                </div>
              ) : null}

              {progress ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between t-label-12 text-gray-800">
                    <span>{progress.stage}</span>
                    <span className="t-mono-12">{progress.detail || `${progress.percent}%`}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-300" role="progressbar" aria-label={progress.stage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                    <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${Math.max(2, progress.percent)}%` }} />
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
                    <li>1. 在启动器中点击「导入整合包」，选择刚生成的文件</li>
                    <li>2. 启动游戏，服务器已出现在多人游戏列表中：<span className="t-mono-12">{effectiveAddr}</span></li>
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
                不想新建实例？选择你的 <span className="t-mono-12">.minecraft</span>，模组与服务器列表会一并写入
              </span>
              <Button size="sm" variant="ghost" onClick={copyDiagnostic}>
                <ClipboardCopy className="size-3.5" />
                进不去？复制诊断
              </Button>
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
              版本不对会连不上：本机客户端需要 {room.mc} + {serverTypeLabel((room.loader || "vanilla") as never)}。
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
          <div className="grid gap-3 text-center sm:grid-cols-3">
            {["粘贴朋友发来的邀请", "检查版本与所需模组", "准备客户端并进入游戏"].map((text, index) => (
              <div key={text} className="rounded-lg bg-background-100 px-3 py-3 text-[12px] text-gray-800 shadow-geist-border"><span className="mr-2 font-medium text-brand-600">0{index + 1}</span>{text}</div>
            ))}
          </div>
        ) : null}
      </PageBody>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background-200 p-3">
      <div className="flex items-center gap-1.5 text-gray-700">
        {icon}
        <span className="t-label-12">{label}</span>
      </div>
      <div className="t-label-13 mt-1 text-gray-1000">{value}</div>
    </div>
  );
}
