import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Link2, Package, QrCode, RefreshCw, Send } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, SegmentedControl } from "@/components/ui/misc";
import type { Instance } from "@/lib/types";
import { encodeRoom, roomDeepLink, roomInstallLink, roomShareText, roomWebLink, type RoomDescriptorV1 } from "@/lib/room";
import { copyText } from "@/lib/utils";
import { useConfig } from "@/stores/config";

type AddrMode = "lan" | "custom";

export function InviteDialog({
  open,
  onOpenChange,
  instance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Instance;
}) {
  const [mode, setMode] = useState<AddrMode>("lan");
  const [lanIp, setLanIp] = useState("");
  const [customAddr, setCustomAddr] = useState("");
  const [roomName, setRoomName] = useState(instance.name);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [modRefs, setModRefs] = useState<{ p: string; v: string; n?: string }[]>([]);
  const [stale, setStale] = useState(false);
  const [resolving, setResolving] = useState(false);

  /** 当前 Mod 清单指纹：用来判断「上次生成的邀请码是否已过期」 */
  const fingerprint = useMemo(() => modRefs.map((m) => `${m.p}:${m.v}`).sort().join("|"), [modRefs]);
  const storageKey = `mcss.room.${instance.id}`;

  useEffect(() => {
    if (!open) return;
    void window.mcss.app.lanAddress().then((r) => setLanIp(r.ip)).catch(() => setLanIp("127.0.0.1"));
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

  const addr = mode === "lan" ? `${lanIp || "127.0.0.1"}:${instance.port}` : customAddr.trim();

  const room = useMemo<RoomDescriptorV1>(
    () => ({
      v: 1,
      name: roomName || instance.name,
      addr,
      // 顺带带上内网地址：同 WiFi 的朋友会优先直连，延迟低一个数量级
      lan: lanIp ? `${lanIp}:${instance.port}` : undefined,
      mc: instance.mcVersion,
      loader: instance.loader,
      lv: instance.loaderVersion,
      // 通过资源库装的 Mod 会被带进房间码（客户端可按 id 自动拉齐）
      mods: modRefs,
    }),
    [roomName, addr, instance, modRefs],
  );

  async function generate() {
    if (!addr || !addr.includes(":")) {
      toast.error("地址要写成 host:port");
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
    if (open && addr) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, addr, roomName]);

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
              <Badge variant="gray">{instance.loader}</Badge>
              <span className="t-label-12 text-gray-700">
                {resolving ? "正在匹配 Modrinth…" : modRefs.length ? `${modRefs.length} 个 Mod 会写进邀请` : "没有可自动分发的 Mod"}
              </span>
            </div>
          </Field>
        </div>

        <Field label="朋友怎么连进来">
          <SegmentedControl
            grow
            value={mode}
            onValueChange={(v) => setMode(v as AddrMode)}
            options={[
              { value: "lan", label: `同一 WiFi（${lanIp || "…"}:${instance.port}）` },
              { value: "custom", label: "公网 / FRP 地址" },
            ]}
          />
        </Field>

        {mode === "lan" ? (
          <div className="rounded-lg bg-amber-700/10 p-3 t-label-12 text-amber-900">
            内网地址只在同一个 WiFi 下有效。要让外网的朋友进得来，先去「联机」页开一条隧道，再切到右边填隧道给你的公网地址。
          </div>
        ) : (
          <Field label="公网地址" hint="FRP 隧道建立后显示的那个地址，形如 xxx.com:23456">
            <Input
              value={customAddr}
              onChange={(e) => setCustomAddr(e.target.value)}
              placeholder="frp.example.com:25565"
              className="font-mono text-[12.5px]"
            />
          </Field>
        )}

        {stale ? (
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
            <Field label="一键进服链接">
              <div className="flex gap-2">
                <Input value={roomWebLink(code)} readOnly className="font-mono text-[11.5px]" />
                <Button variant="secondary" onClick={() => copy(roomWebLink(code), "链接")}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </Field>

            <Field label="房间码（短，可手抄）">
              <div className="flex gap-2">
                <Input value={code} readOnly className="font-mono text-[11.5px]" />
                <Button variant="secondary" onClick={() => copy(code, "房间码")}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => copy(roomShareText(room, code), "邀请文案")}>
                <Send className="size-3.5" />
                复制邀请文案
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
              <Button size="sm" variant="secondary" onClick={() => copy(roomDeepLink(code), "深链")}>
                <Link2 className="size-3.5" />
                复制 mcss:// 深链
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => copy(roomInstallLink(code), "一键准备好链接")}
              >
                <Package className="size-3.5" />
                一键准备好链接
              </Button>
              <Button size="sm" variant="ghost" onClick={generate} loading={busy}>
                <RefreshCw className="size-3.5" />
                重新生成
              </Button>
              <span className="ml-auto inline-flex items-center gap-1 t-label-12 text-gray-700">
                <QrCode className="size-3.5" />
                二维码下一步接
              </span>
            </div>

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
