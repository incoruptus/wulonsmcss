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
import { pickPath } from "@/lib/path-picker";
import { useI18n } from "@/i18n";

const EMPTY: FrpProfile = {
  id: "",
  name: "我的中转",
  kind: "frpc",
  serverAddr: "",
  serverPort: 7000,
  token: "",
  localPort: 25565,
  remotePort: 25565,
  type: "tcp",
};

export default function Network() {
  const { t } = useI18n();
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
      toast.error(t("network.missingAddr", "先填服务端地址和远端端口"));
      return;
    }
    const profile = { ...draft, id: draft.id || uid() };
    await save(profile);
    setBusy(true);
    try {
      const res = await window.mcss.frp.start(profile);
      if (!res.ok) throw new Error(res.error || t("network.connectFailed", "连接失败"));
      toast.success(t("network.connecting", "正在建立中转线路…"));
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
        className="max-w-6xl"
        title={t("network.title", "让朋友进来")}
        desc={t("network.desc", "先检查朋友现在能不能进来；能进来就复制地址，不能进来就在下面开一条中转线路。")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDiagOpen(true)}>
              <LifeBuoy className="size-3.5" />
              {t("network.helpBtn", "朋友进不来？")}
            </Button>
            <Badge variant={running ? "green" : "gray"} size="md"><span className="status-dot" />{running ? t("network.tunnel.connected", "中转已连接") : t("network.tunnel.disconnected", "中转未连接")}</Badge>
          </div>
        }
      />
      <PageBody className="grid max-w-6xl gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card className="lg:col-span-2">
          <NetDoctorCard port={activeInstance?.port ?? 25565} />
        </Card>

        <Card id="frp-tunnel" className="space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="size-[18px] text-brand-600" />
            <div><h3 className="t-h-16 text-gray-1000">{t("network.tunnel.title", "中转线路")}</h3><p className="t-copy-13 mt-1 text-gray-800">{t("network.tunnel.desc", "直连不通时用这里：让服务器通过一台中转服务器把朋友接进来，不需要朋友改网络设置。")}</p></div>
          </div>

          <Field label={t("network.kind.label", "用哪种中转")} hint={t("network.kind.hint", "没有自己的中转服务器时，可选樱花中转；它需要额外启动器。")}>
            <SegmentedControl
              grow
              value={draft.kind}
              onValueChange={(v) => setDraft({ ...draft, kind: v as FrpProfile["kind"] })}
              options={
                isDesktopVisual()
                  ? [
                      { value: "frpc", label: t("network.kind.frpc", "自建中转（frp）") },
                      { value: "sakura", label: t("network.kind.sakura", "樱花中转") },
                    ]
                  : [{ value: "frpc", label: t("network.kind.frpc", "自建中转（frp）") }]
              }
            />
          </Field>

          {draft.kind === "sakura" ? (
            <Field label={t("network.sakuraPath.label", "樱花中转启动器路径")} hint={t("network.sakuraPath.hint", "这里只负责启动它，连接状态以启动器里显示的为准")}>
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
                    const p = await pickPath({
                      mode: "file",
                      title: t("network.pickFrpc", "选择 frpc 程序"),
                      filters: [{ name: t("network.filterApps", "应用程序"), extensions: ["exe"] }],
                    });
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
                <Field label={t("network.serverAddr.label", "中转服务器地址")} hint={t("network.serverAddr.hint", "服务商给你的地址，跟 Minecraft 服务器地址不同")}>
                  <Input value={draft.serverAddr} onChange={(e) => setDraft({ ...draft, serverAddr: e.target.value.trim() })} placeholder="frp.example.com" />
                </Field>
                <Field label={t("network.serverPort.label", "中转服务端口")}>
                  <Input value={String(draft.serverPort)} onChange={(e) => setDraft({ ...draft, serverPort: Number(e.target.value.replace(/\D/g, "")) || 7000 })} />
                </Field>
              </div>
              <Field label={t("network.token.label", "访问密码")} hint={t("network.token.hint", "服务商给你的密码，跟 Minecraft 服务器密码无关")}>
                <Input type="password" value={draft.token} onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t("network.localPort.label", "本机服务器端口")} hint={t("network.localPort.hint", "一般就是 25565")}>
                  <Input value={String(draft.localPort)} onChange={(e) => setDraft({ ...draft, localPort: Number(e.target.value.replace(/\D/g, "")) || 25565 })} />
                </Field>
                <Field label={t("network.remotePort.label", "朋友连接用的端口")} hint={t("network.remotePort.hint", "以服务商说明为准")}>
                  <Input value={String(draft.remotePort)} onChange={(e) => setDraft({ ...draft, remotePort: Number(e.target.value.replace(/\D/g, "")) || 25565 })} />
                </Field>
                <Field label={t("network.protocol.label", "连接协议")} hint={t("network.protocol.hint", "Minecraft 用 TCP；不懂就保持默认")}>
                  <Picker
                    value={draft.type}
                    onValueChange={(v) => setDraft({ ...draft, type: v as FrpProfile["type"] })}
                    options={[
                      { value: "tcp", label: t("network.protocol.tcpMc", "TCP（MC）") },
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
                {t("network.disconnect", "断开")}
              </Button>
            ) : (
              <Button variant="accent" onClick={connect} loading={busy}>
                <Plug className="size-4" />
                {t("network.connect", "连接")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => save({ ...draft, id: draft.id || uid() })}>
              {t("network.saveConfig", "保存配置")}
            </Button>
          </div>

          {address ? (
            <div className="flex items-center gap-2 rounded-lg bg-background-100 p-3 shadow-geist-border">
              <Power className="size-4 text-green-900" />
              <span className="t-label-12 text-gray-700">{t("network.publicAddr", "公网地址")}</span>
              <span className="t-mono-13 text-gray-1000">{address}</span>
              <Button
                size="xs"
                variant="secondary"
                className="ml-auto"
                onClick={async () => {
                  await copyText(address);
                  toast.success(t("network.addrCopied", "地址已复制，发送给朋友即可连接"));
                }}
              >
                <Copy className="size-3" />
                {t("network.copy", "复制")}
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="flex min-h-[320px] flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="t-h-14 text-gray-1000">{t("network.logs.title", "中转日志")}</h3>
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
              {t("pages.common.refresh", "刷新")}
            </Button>
          </div>
          <div ref={logRef} role="log" aria-label={t("network.logs.title", "中转日志")} className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-background-200 p-3 font-mono text-[12px] leading-5 scroll-thin">
            {logs.length === 0 ? (
              <EmptyState title={t("network.logs.empty.title", "还没有日志")} desc={t("network.logs.empty.desc", "点「连接」后，frpc 的输出会显示在这里。")} className="py-8" />
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
