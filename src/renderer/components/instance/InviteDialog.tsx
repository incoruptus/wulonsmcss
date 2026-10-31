import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Link2, Package, RefreshCw, Send } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { useReach } from "@/hooks/useReach";
import type { Instance } from "@/lib/types";
import { encodeRoom, roomDeepLink, roomInstallLink, roomShareText, roomWebLink, type RoomDescriptorV1 } from "@/lib/room";
import { hostSummary, hostTone, hostVerdict, parseAddr, primaryAddress, roomAddrsFrom } from "@/lib/reach";
import { publicWebOrigin } from "@/lib/links";
import { serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { copyText } from "@/lib/utils";
import { useConfig } from "@/stores/config";

export function InviteDialog({
  open,
  onOpenChange,
  instance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Instance;
}) {
  const navigate = useNavigate();
  const [manual, setManual] = useState("");
  const [roomName, setRoomName] = useState(instance.name);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [modRefs, setModRefs] = useState<{ p: string; v: string; n?: string }[]>([]);
  const [stale, setStale] = useState(false);
  const [resolving, setResolving] = useState(false);
  const { report, checking, refresh } = useReach(instance.port, { auto: false });

  /** 当前 Mod 清单指纹：用来判断「上次生成的邀请码是否已过期」 */
  const fingerprint = useMemo(() => modRefs.map((m) => `${m.p}:${m.v}`).sort().join("|"), [modRefs]);
  const storageKey = `mcss.room.${instance.id}`;

  useEffect(() => {
    if (!open) return;
    // 打开就测一遍：结论来自真实探测，不再是让服主自己猜「内网还是公网」
    void refresh();
    // 用 Modrinth 索引给房间码带上「需要哪些 Mod」
    void (async () => {
      const cfg = useConfig.getState().cfg;
      const index = cfg.modrinthIndex ?? {};
      const list = await window.mcss.mods.scan(`${instance.dir}\\mods`).catch(() => []);

      // 手动装进 mods/ 的 Mod 没有索引：按 mod id 反查 Modrinth，查到就记下来（只查一次）
      const missing = list
        .filter((m) => !index[m.file])
        .map((m) => ({ id: m.id, file: m.file, version: m.version }));
      if (missing.length) {
        setResolving(true);
        const resolved = await window.mcss.mods.resolveModrinth(missing).catch(() => []);
        setResolving(false);
        if (resolved.length) {
          const merged = { ...index };
          for (const r of resolved) merged[r.file] = { p: r.p, v: r.v, n: r.n };
          await useConfig.getState().patch({ modrinthIndex: merged });
          Object.assign(index, merged);
        }
      }

      const refs = list
        .map((m) => index[m.file])
        .filter(Boolean)
        .map((x) => ({ p: x.p, v: x.v, n: x.n }));
      setModRefs(refs);
    })();
  }, [open, instance.dir]);

  const probes = useMemo(() => report?.probes ?? [], [report]);
  const verdict = hostVerdict(probes);
  const summary = hostSummary(verdict);
  const tone: "green" | "amber" | "gray" | "red" = checking ? "gray" : hostTone(verdict);
  // 只把验证通过的地址写进邀请；服务器没开时宁可没有地址，也不发一条连不上的
  const lanProbe = probes.find((p) => p.target.kind === "lan" && p.ok);
  const lanAddr = lanProbe?.addr ?? "";
  const autoAddr = primaryAddress(probes) ?? "";
  const addr = manual.trim() || autoAddr;

  const addrs = useMemo(() => {
    const list = roomAddrsFrom(probes);
    const picked = manual.trim() ? parseAddr(manual.trim(), instance.port) : null;
    if (picked && !list.some((a) => a.host === picked.host && a.port === picked.port)) {
      list.push({ k: "manual", ...picked });
    }
    return list;
  }, [probes, instance.port, manual]);

  // 网页版没部署时不要给朋友一条 404 链接；此时只发房间码/进服包
  const webOrigin = publicWebOrigin();

  const room = useMemo<RoomDescriptorV1>(
    () => ({
      v: 1,
      name: roomName || instance.name,
      addr,
      // 顺带带上内网地址：同 WiFi 的朋友会优先直连，延迟低一个数量级
      lan: lanAddr || undefined,
      addrs: addrs.length ? addrs : undefined,
      mc: instance.mcVersion,
      loader: instance.loader,
      lv: instance.loaderVersion,
      // 通过资源库装的 Mod 会被带进房间码（客户端可按 id 自动拉齐）
      mods: modRefs,
    }),
    [roomName, addr, lanAddr, addrs, instance, modRefs],
  );

  async function generate() {
    if (!parseAddr(addr)) {
      toast.error("还没有可用的地址：先开一条隧道，或者让朋友连同一 WiFi");
      return;
    }
    setBusy(true);
    try {
      setCode(await encodeRoom(room));
      try {
        localStorage.setItem(storageKey, JSON.stringify({ fp: fingerprint, at: Date.now() }));
      } catch (e) {}
      setStale(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open && parseAddr(addr)) void generate();
    if (!parseAddr(addr)) setCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room]);

  useEffect(() => {
    if (!open) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as { fp?: string } | null;
      setStale(Boolean(saved?.fp && saved.fp !== fingerprint));
    } catch (e) {
      setStale(false);
    }
  }, [open, fingerprint, storageKey]);

  async function copy(text: string, label: string) {
    const ok = await copyText(text);
    ok ? toast.success(`${label}已复制`) : toast.error("复制失败，请手动选中");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-2xl">
      <DialogHeader
        title="邀请朋友"
        desc="生成一条自包含的邀请链接：朋友点开就知道连哪个地址、要什么版本，不需要我们托管任何数据。"
      />
      <DialogBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="房间名">
            <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </Field>
          <Field label="版本">
            <div className="flex h-9 items-center gap-2">
              <Badge variant="gray">{instance.mcVersion}</Badge>
              <Badge variant="gray">{serverTypeLabel(serverTypeOf(instance))}</Badge>
              <span className="t-label-12 text-gray-700">
                {resolving ? "正在匹配 Modrinth…" : modRefs.length ? `${modRefs.length} 个 Mod 会写进邀请` : "没有可自动分发的 Mod"}
              </span>
            </div>
          </Field>
        </div>

        <Field label="朋友怎么连进来" hint="自动挑一条验证过的地址；同 WiFi 的会走内网，外网的走这条">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-100 p-3 shadow-geist-border">
            <Badge variant={tone}>{checking ? "正在检测…" : summary.title}</Badge>
            <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000">{addr || "还没有可用地址"}</span>
            <Button size="xs" variant="ghost" onClick={() => void refresh({ fresh: true })} disabled={checking}>
              <RefreshCw className={checking ? "size-3 animate-spin" : "size-3"} />
              重测
            </Button>
          </div>
        </Field>

        <p className="t-label-12 text-gray-800">{summary.detail}</p>

        {!addr ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-700/10 p-3 t-label-12 text-amber-900">
            <AlertTriangle className="size-3.5 shrink-0" />
            {verdict === "local-only"
              ? "服务器只接受本机连接，朋友进不来：先检查 server-ip，或者开一条隧道。"
              : "还没有一条验证通过的路。先确认服务器在跑，再开一条隧道。"}
            <Button
              size="xs"
              variant="secondary"
              className="ml-auto"
              onClick={() => {
                onOpenChange(false);
                navigate("/network");
              }}
            >
              <Link2 className="size-3" />
              去开隧道
            </Button>
          </div>
        ) : null}

        <details className="rounded-lg bg-background-200 p-3">
          <summary className="cursor-pointer t-label-12 text-gray-700">手动指定地址（高级）</summary>
          <div className="mt-2 space-y-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value.trim())}
              placeholder="frp.example.com:25565；留空就自动选"
              className="font-mono text-[12.5px]"
            />
            <p className="t-label-12 text-gray-700">
              邀请里会带上验证过的内网地址（{lanAddr || "暂无"}），方便同 WiFi 直连；不想带就在这里指定一条公网地址。
            </p>
          </div>
        </details>

        {stale && code ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-700/10 p-2.5 t-label-12 text-amber-900">
            <AlertTriangle className="size-3.5 shrink-0" />
            服务器 Mod 清单变了，旧链接里的 Mod 可能不全——建议重新生成再发。
            <Button size="xs" variant="secondary" className="ml-auto" onClick={generate} loading={busy}>
              重新生成
            </Button>
          </div>
        ) : null}

        {code ? (
          <>
            {webOrigin ? (
              <Field label="一键进服链接">
                <div className="flex gap-2">
                  <Input value={roomWebLink(code, webOrigin)} readOnly className="font-mono text-[11.5px]" />
                  <Button variant="secondary" onClick={() => copy(roomWebLink(code, webOrigin), "链接")}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </Field>
            ) : (
              <div className="rounded-lg bg-background-200 p-2.5 t-label-12 text-gray-800">
                先发下面的「房间码」或「进服包」：朋友在 MCSS 里粘贴房间码，或者在启动器里导入进服包，不用打开网页也能进。
              </div>
            )}

            <Field label="房间码（复制粘贴；带 Mod 时会比较长）">
              <div className="flex gap-2">
                <Input value={code} readOnly className="font-mono text-[11.5px]" />
                <Button variant="secondary" onClick={() => copy(code, "房间码")}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => copy(roomShareText(room, code, webOrigin ?? undefined), "邀请文案")}>
                <Send className="size-3.5" />
                复制发给朋友的邀请
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const target = await window.mcss.dialog.saveFile({
                    defaultPath: `${room.name || "mcss-room"}.mrpack`,
                    filters: [{ name: "Modrinth 整合包", extensions: ["mrpack"] }],
                  });
                  if (!target) return;
                  setBusy(true);
                  try {
                    const res = await window.mcss.client.exportMrpack({ outFile: target, room });
                    if (!res.ok) throw new Error(res.error || "导出失败");
                    toast.success("进服包已导出", {
                      description: `${res.mods ?? 0} 个 Mod · 直接发群里，朋友在启动器导入即可`,
                    });
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Package className="size-3.5" />
                导出进服包
              </Button>
              <Button size="sm" variant="ghost" onClick={generate} loading={busy}>
                <RefreshCw className="size-3.5" />
                重新生成
              </Button>
              <span className="ml-auto t-label-12 text-gray-700">
                {webOrigin ? "链接里带着地址、版本和 Mod" : "先发房间码或进服包"}
              </span>
            </div>

            <details className="rounded-lg bg-background-200 p-3">
              <summary className="cursor-pointer t-label-12 text-gray-700">其他方式</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="xs" variant="secondary" onClick={() => copy(roomDeepLink(code), "深链")}>
                  <Link2 className="size-3" />
                  复制 mcss:// 深链
                </Button>
                <Button size="xs" variant="secondary" onClick={() => copy(roomInstallLink(code), "一键准备好链接")}>
                  <Package className="size-3" />
                  复制一键准备好链接
                </Button>
              </div>
            </details>

            <div className="rounded-lg bg-background-200 p-3">
              <div className="mb-1 flex items-center gap-1.5 t-label-12 text-gray-700">
                <Check className="size-3.5 text-green-900" />
                发给朋友的样子
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] leading-5 text-gray-900">
                {roomShareText(room, code)}
              </pre>
            </div>
          </>
        ) : (
          <div className="t-label-13 text-gray-700">{busy ? "生成中…" : "填好地址后自动生成"}</div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
