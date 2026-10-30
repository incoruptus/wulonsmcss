import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, FolderOpen, LifeBuoy, Link2, Plug, Power, RefreshCw, Unplug } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge, Card, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { DiagnoseDialog } from "@/components/instance/DiagnoseDialog";
import { NetDoctorCard } from "@/components/network/NetDoctorCard";
import { useConfig } from "@/stores/config";
import { copyText, uid } from "@/lib/utils";
import { isDesktopVisual } from "@/lib/shell";
import type { FrpProfile } from "@/lib/types";

const EMPTY: FrpProfile = {
  id: "",
  name: "我的隧道",
  kind: "frpc",
  serverAddr: "",
  serverPort: 7000,
  token: "",
  localPort: 25565,
  remotePort: 25565,
  type: "tcp",
};

export default function Network() {
  const cfg = useConfig((s) => s.cfg);
  const patch = useConfig((s) => s.patch);
  const activeInstance = cfg.instances.find((i) => i.id === cfg.activeInstanceId) ?? cfg.instances[0];

  const saved = cfg.frpProfiles[0] ?? null;
  const [draft, setDraft] = useState<FrpProfile>(saved ?? { ...EMPTY, localPort: activeInstance?.port ?? 25565 });
  const [running, setRunning] = useState(false);
  const [address, setAddress] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 网页 agent 不支持樱花穿透；别让配置停在一个跑不了的模式上
    if (!isDesktopVisual() && draft.kind === "sakura") setDraft((d) => ({ ...d, kind: "frpc" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.kind]);

  useEffect(() => {
    const offLog = window.mcss.frp.onLog((line) => setLogs((l) => [...l.slice(-299), line]));
    const offStatus = window.mcss.frp.onStatus((s) => {
      setRunning(s.running);
      setAddress(s.address ?? "");
      if (s.error) toast.error(s.error);
    });
    window.mcss.frp.status().then((s) => {
      setRunning(s.running);
      setAddress(s.address ?? "");
    }).catch(() => {});
    return () => {
      offLog();
      offStatus();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  async function save(next: FrpProfile) {
    const list = cfg.frpProfiles.length ? cfg.frpProfiles.map((p, i) => (i === 0 ? next : p)) : [next];
    await patch({ frpProfiles: list });
    setDraft(next);
  }

  async function connect() {
    if (draft.kind === "frpc" && (!draft.serverAddr || !draft.remotePort)) {
      toast.error("先填服务端地址和远端端口");
      return;
    }
    const profile = { ...draft, id: draft.id || uid() };
    await save(profile);
    setBusy(true);
    try {
      const res = await window.mcss.frp.start(profile);
      if (!res.ok) throw new Error(res.error || "连接失败");
      toast.success("正在建立隧道…");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await window.mcss.frp.stop();
    setRunning(false);
    setAddress("");
  }

  return (
    <>
      <PageHeader
        title="让外网的朋友进来"
        desc="同一个 WiFi 不用这页：直接发你的内网地址（192.168 / 10 / 172.16 开头）。只有不在同一个网络时才需要内网穿透。"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDiagOpen(true)}>
              <LifeBuoy className="size-3.5" />
              朋友进不来？
            </Button>
            <Badge variant={running ? "green" : "gray"} size="md">
              {running ? "隧道已连接" : "未连接"}
            </Badge>
          </div>
        }
      />
      <PageBody className="grid max-w-5xl gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="lg:col-span-2">
          <NetDoctorCard />
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-gray-800" />
            <h3 className="t-h-14 text-gray-1000">隧道配置</h3>
          </div>

          <Field label="用哪种隧道" hint="没有自己的 frp 服务器？选樱花穿透（桌面版）或先找现成服务">
            <SegmentedControl
              grow
              value={draft.kind}
              onValueChange={(v) => setDraft({ ...draft, kind: v as FrpProfile["kind"] })}
              options={
                isDesktopVisual()
                  ? [
                      { value: "frpc", label: "通用 frp（自备服务器）" },
                      { value: "sakura", label: "樱花穿透" },
                    ]
                  : [{ value: "frpc", label: "通用 frp（自备服务器）" }]
              }
            />
          </Field>

          {draft.kind === "sakura" ? (
            <Field label="SakuraFrp 启动器路径" hint="软件只负责拉起它，隧道状态以启动器内显示为准">
              <div className="flex gap-2">
                <Input
                  value={draft.exePath ?? ""}
                  onChange={(e) => setDraft({ ...draft, exePath: e.target.value })}
                  className="font-mono text-[12px]"
                  placeholder="C:\\Program Files\\SakuraFrpLauncher\\SakuraFrpLauncher.exe"
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const p = await window.mcss.dialog.openFile([{ name: "应用程序", extensions: ["exe"] }]);
                    if (p) setDraft({ ...draft, exePath: p });
                  }}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </Field>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="frp 服务器地址" hint="填隧道服务商给你的地址，不是你的 Minecraft 服务器地址">
                  <Input value={draft.serverAddr} onChange={(e) => setDraft({ ...draft, serverAddr: e.target.value.trim() })} placeholder="frp.example.com" />
                </Field>
                <Field label="服务端端口">
                  <Input value={String(draft.serverPort)} onChange={(e) => setDraft({ ...draft, serverPort: Number(e.target.value.replace(/\D/g, "")) || 7000 })} />
                </Field>
              </div>
              <Field label="访问密码（Token）" hint="隧道服务商给你的密码，不是 Minecraft 的">
                <Input type="password" value={draft.token} onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="本机 MC 端口" hint="一般就是 25565">
                  <Input value={String(draft.localPort)} onChange={(e) => setDraft({ ...draft, localPort: Number(e.target.value.replace(/\D/g, "")) || 25565 })} />
                </Field>
                <Field label="公网端口" hint="朋友连接时用的端口；服务商给的说明里会写">
                  <Input value={String(draft.remotePort)} onChange={(e) => setDraft({ ...draft, remotePort: Number(e.target.value.replace(/\D/g, "")) || 25565 })} />
                </Field>
                <Field label="协议" hint="Minecraft 一般选 TCP">
                  <Picker
                    value={draft.type}
                    onValueChange={(v) => setDraft({ ...draft, type: v as FrpProfile["type"] })}
                    options={[
                      { value: "tcp", label: "TCP（MC）" },
                      { value: "udp", label: "UDP" },
                      { value: "http", label: "HTTP" },
                      { value: "https", label: "HTTPS" },
                    ]}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            {running ? (
              <Button variant="error" onClick={disconnect}>
                <Unplug className="size-4" />
                断开
              </Button>
            ) : (
              <Button onClick={connect} loading={busy}>
                <Plug className="size-4" />
                连接
              </Button>
            )}
            <Button variant="secondary" onClick={() => save({ ...draft, id: draft.id || uid() })}>
              保存配置
            </Button>
          </div>

          {address ? (
            <div className="flex items-center gap-2 rounded-lg bg-background-100 p-3 shadow-geist-border">
              <Power className="size-4 text-green-900" />
              <span className="t-label-12 text-gray-700">公网地址</span>
              <span className="t-mono-13 text-gray-1000">{address}</span>
              <Button
                size="xs"
                variant="secondary"
                className="ml-auto"
                onClick={async () => {
                  await copyText(address);
                  toast.success("地址已复制，发给朋友就能连");
                }}
              >
                <Copy className="size-3" />
                复制
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="flex min-h-[320px] flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="t-h-14 text-gray-1000">隧道日志</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLogs([]);
                window.mcss.frp.status().then((s) => {
                  setRunning(s.running);
                  setAddress(s.address ?? "");
                }).catch(() => {});
              }}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          </div>
          <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-background-100 p-3 font-mono text-[12px] leading-5 shadow-geist-border scroll-thin">
            {logs.length === 0 ? (
              <EmptyState title="还没有日志" desc="点「连接」后，frpc 的输出会显示在这里。" className="py-8" />
            ) : (
              logs.map((line, i) => (
                <div key={i} className={line.includes("error") || line.includes("failed") ? "text-red-900" : "text-gray-900"}>
                  {line}
                </div>
              ))
            )}
          </div>
        </Card>
      </PageBody>
      <DiagnoseDialog open={diagOpen} onOpenChange={setDiagOpen} />
    </>
  );
}
