import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cloud, Copy, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, SwitchRow } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { useConfig } from "@/stores/config";
import { buildDeps, markIdle, markOff, runSync, useSync } from "@/lib/sync/engine";
import { generatePairCode, isPairCodeWellFormed, normalizePairCode } from "@/lib/sync/crypto";
import { copyText, formatDateTime, uid } from "@/lib/utils";
import type { SyncConfig } from "@/lib/sync/types";

const PHASE: Record<string, { label: string; variant: "gray" | "blue" | "green" | "amber" }> = {
  off: { label: "未开启", variant: "gray" },
  idle: { label: "待同步", variant: "gray" },
  syncing: { label: "同步中…", variant: "blue" },
  ok: { label: "已同步", variant: "green" },
  error: { label: "需要处理", variant: "amber" },
};

export function SyncCard() {
  const cfg = useConfig((s) => s.cfg);
  const patch = useConfig((s) => s.patch);
  const status = useSync((s) => s.status);

  const sync = cfg.sync;
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setToken(sync?.token ?? "");
    setCode(sync?.pairCode ?? "");
  }, [sync?.token, sync?.pairCode]);

  const configured = Boolean(sync?.token && sync.pairCode && isPairCodeWellFormed(sync.pairCode));

  useEffect(() => {
    if (configured) markIdle();
    else markOff();
  }, [configured]);

  /** 写入 sync 配置（首次自动补 deviceId） */
  async function saveSync(p: Partial<SyncConfig>) {
    const base: SyncConfig =
      sync ?? {
        enabled: false,
        autoSync: false,
        token: "",
        gistId: null,
        pairCode: "",
        deviceId: uid(),
      };
    await patch({ sync: { ...base, deviceId: base.deviceId || uid(), ...p } });
  }

  async function doSync() {
    setBusy(true);
    try {
      const out = await runSync(buildDeps({ getConfig: () => useConfig.getState().cfg, patch }), { manual: true });
      const bits: string[] = [];
      if (out.applied) {
        bits.push(`新增 ${out.applied.added} · 更新 ${out.applied.updated} · 删除 ${out.applied.deleted}`);
      }
      toast.success(out.pulled || out.pushed ? "同步完成" : "已经是最新", { description: bits.join(" · ") || undefined });
    } catch (e) {
      toast.error(`同步失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const phase = PHASE[status.phase] ?? PHASE.off;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Cloud className="size-4 text-gray-800" />
        <h3 className="t-h-14 text-gray-1000">跨端同步 · GitHub Gist</h3>
        <Badge variant={phase.variant} size="sm">{phase.label}</Badge>
        <span className="t-label-12 text-gray-700">
          {status.phase === "error" && status.message
            ? <span className="text-amber-900">{status.message}</span>
            : sync?.lastSyncAt
              ? `上次同步 ${formatDateTime(sync.lastSyncAt)}`
              : configured
                ? "还没有同步过"
                : "换电脑时同步服务器清单；不换电脑可以不开"}
        </span>
      </div>

      <p className="t-label-12 mb-3 text-gray-700">
        换一台电脑继续管理时用。内容会先加密再上传，GitHub Gist 里只有密文；本机目录和 Java 路径不会上传。
      </p>

      <details className="rounded-lg bg-background-200 p-3" open={configured ? true : undefined}>
        <summary className="cursor-pointer t-label-12 text-gray-700">配对码与 GitHub Token（高级）</summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="配对码" hint="同一配对码请配置到各台设备，避免外传">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onBlur={() => code && normalizePairCode(code) !== sync?.pairCode && saveSync({ pairCode: normalizePairCode(code), lastPushHash: null })}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              className="font-mono text-[13px] tracking-wide"
            />
            <IconButton
              label="复制配对码"
              onClick={async () => {
                if (!code) return;
                const ok = await copyText(code);
                toast[ok ? "success" : "info"](ok ? "配对码已复制" : "复制失败，请手动选中");
              }}
            >
              <Copy className="size-3.5" />
            </IconButton>
            <Button
              variant="secondary"
              onClick={() => {
                const next = generatePairCode();
                setCode(next);
                void saveSync({ pairCode: next, lastPushHash: null });
                toast.success("新配对码已生成，请复制到每一台设备");
              }}
            >
              生成
            </Button>
          </div>
        </Field>

        <Field label="GitHub Token" hint={sync?.token ? "已保存（只留在这台设备）" : "fine-grained 与 classic 令牌均可，仅需 gist 权限"}>
          <div className="flex gap-2">
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_… 或 github_pat_…"
              className="font-mono text-[13px]"
            />
            <Button
              variant="secondary"
              disabled={!token || token === sync?.token}
              onClick={async () => {
                await saveSync({ token: token.trim() });
                toast.success("Token 已保存");
              }}
            >
              保存
            </Button>
          </div>
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={doSync} loading={busy || status.phase === "syncing"} disabled={!configured}>
          <RefreshCw className="size-3.5" />
          立即同步
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const next = generatePairCode();
            setCode(next);
            void saveSync({ pairCode: next, gistId: null, lastPushHash: null, excludeGistIds: [...(sync?.excludeGistIds ?? []), ...(sync?.gistId ? [sync.gistId] : [])] });
            toast.success("已断开仓库连接，下次同步将新建一个 Gist");
          }}
        >
          <KeyRound className="size-3.5" />
          重新配对
        </Button>
        <span className="t-label-12 text-gray-700">
          {sync?.gistId ? `仓库 ${sync.gistId.slice(0, 8)}…` : "第一次同步会自动创建私有 Gist"}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto hover:text-red-900" onClick={() => setConfirmReset(true)}>
          <Trash2 className="size-3.5" />
          断开
        </Button>
      </div>

      <div className="mt-3 border-t border-gray-300 pt-3">
        <SwitchRow
          label="启用自动同步"
          hint="应用启动时自动同步一次，手动同步不受此设置影响"
          checked={Boolean(sync?.enabled)}
          onCheckedChange={(v) => saveSync({ enabled: v })}
        />
      </div>

      <div className="mt-2 flex items-center gap-1.5 t-label-12 text-gray-700">
        <ShieldCheck className="size-3.5" />
        加密细节：先 gzip 压缩，再用 AES-GCM-256 加密（PBKDF2-SHA256，60 万次迭代）
      </div>
      </details>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset} widthClass="max-w-md">
        <DialogHeader title="断开同步？" desc="将清空本机的 Token 与配对信息，Gist 中的密文不会被删除。" />
        <DialogBody>
          <p className="t-label-13 text-gray-800">
            重新开启时需再次填写 Token 并输入原配对码，才能读取此前的云端内容。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>取消</Button>
          <Button
            variant="error"
            onClick={async () => {
              await patch({ sync: null });
              setConfirmReset(false);
              markOff();
            }}
          >
            断开
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
