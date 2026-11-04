import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardPaste } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { decodeDiagnostic, diagnosticHeadline, diagnosticNext, type DiagnosticV1 } from "@/lib/diagnose";
import { kindLabel, type ReachKind } from "@/lib/reach";
import { useI18n } from "@/i18n";

const VERDICT: Record<string, { key: string; label: string }> = {
  ready: { key: "diagnose.verdict.ready", label: "客户端齐了" },
  "need-mods": { key: "diagnose.verdict.needMods", label: "缺 Mod" },
  "need-version": { key: "diagnose.verdict.needVersion", label: "没有对应版本" },
  "no-client": { key: "diagnose.verdict.noClient", label: "没找到 .minecraft" },
  "no-version": { key: "diagnose.verdict.noVersion", label: "没装过游戏" },
};

/**
 * 服主侧：粘贴玩家发回来的诊断码，直接看到「他那边到底怎么了」。
 * 玩家侧入口在加入页的「进不去？复制诊断」。
 */
export function DiagnoseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [diag, setDiag] = useState<DiagnosticV1 | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function parse() {
    setBusy(true);
    setError("");
    try {
      const next = await decodeDiagnostic(input);
      setDiag(next);
    } catch (e) {
      setDiag(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const next = diag ? diagnosticNext(diag) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-xl">
      <DialogHeader
        title={t("diagnose.title", "朋友进不来？")}
        desc={t("diagnose.desc", "请朋友在加入页点击「复制诊断」，将 d1z 开头的诊断码粘贴到这里。")}
      />
      <DialogBody className="space-y-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("diagnose.codePlaceholder", "粘贴诊断码 d1z.xxxxxx.…")}
          className="h-20 font-mono text-[11.5px]"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={parse} loading={busy} disabled={!input.trim()}>
            <ClipboardPaste className="size-3.5" />
            {t("diagnose.parse", "解析")}
          </Button>
          {error ? (
            <span className="flex items-center gap-1 t-label-12 text-red-900">
              <AlertTriangle className="size-3.5" />
              {error}
            </span>
          ) : null}
        </div>

        {diag ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-background-100 p-3 shadow-geist-border">
              <div className="flex items-center gap-2">
                <Badge variant={diag.probes.some((p) => p.checked && p.ok) ? "amber" : "red"} size="sm">
                  {t("diagnose.result", "诊断结果")}
                </Badge>
                <span className="t-label-13 text-gray-1000">{diagnosticHeadline(diag)}</span>
              </div>
              <p className="t-label-12 mt-1 text-gray-700">
                {diag.room.name} · {diag.room.mc} · {diag.room.loader} · {new Date(diag.at).toLocaleString("zh-CN")}
              </p>
            </div>

            {next ? (
              <Callout
                tone="info"
                title={next.title}
                action={
                  next.action === "network" ? (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        onOpenChange(false);
                        navigate("/network");
                      }}
                    >
                      {t("diagnose.goNetwork", "去联机页")}
                    </Button>
                  ) : undefined
                }
              >
                {next.detail}
              </Callout>
            ) : null}

            <Section title={t("diagnose.section.probes", "玩家试过的地址")}>
              {diag.probes.length ? (
                diag.probes.map((p) => (
                  <div key={`${p.k}:${p.a}`} className="flex items-center gap-2 rounded-md bg-background-100 px-2 py-1.5">
                    <span className="w-14 shrink-0 t-label-12 text-gray-700">{(kindLabel(p.k as ReachKind) || p.k)}</span>
                    <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000">{p.a}</span>
                    <span className={p.checked && p.ok ? "t-label-12 text-green-900" : "t-label-12 text-red-900"}>
                      {!p.checked ? p.e || t("diagnose.probeUnknown", "无法探测") : p.ok ? `${t("diagnose.probeOk", "通了")}${p.ms ? ` · ${p.ms}ms` : ""}` : p.e || t("diagnose.probeFail", "连不上")}
                    </span>
                  </div>
                ))
              ) : (
                <p className="t-label-12 text-gray-700">{t("diagnose.noProbes", "没有地址记录。")}</p>
              )}
            </Section>

            {diag.client ? (
              <Section title={t("diagnose.section.client", "玩家客户端")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={diag.client.verdict === "ready" ? "green" : "amber"} size="sm">
                    {VERDICT[diag.client.verdict] ? t(VERDICT[diag.client.verdict].key, VERDICT[diag.client.verdict].label) : diag.client.verdict}
                  </Badge>
                  <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-700">{diag.client.dir}</span>
                </div>
                {diag.client.match ? <p className="t-label-12 text-gray-800">{t("diagnose.clientMatch", "匹配客户端：{name}", { name: diag.client.match })}</p> : null}
                {diag.client.candidates.length ? (
                  <p className="t-label-12 text-gray-800">{t("diagnose.clientCandidates", "已有客户端：{list}", { list: diag.client.candidates.join("、") })}</p>
                ) : null}
                {diag.client.missing.length ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {diag.client.missing.map((name) => (
                      <Badge key={name} variant="red" size="sm">
                        {t("diagnose.clientMissing", "缺 {name}", { name })}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Section>
            ) : null}

            {diag.launchers?.length ? (
              <Section title={t("diagnose.section.launchers", "玩家的启动器")}>
                <p className="t-label-12 text-gray-800">{diag.launchers.join("、")}</p>
              </Section>
            ) : null}

            {diag.note ? (
              <Section title={t("diagnose.section.note", "玩家留言")}>
                <p className="t-label-12 whitespace-pre-wrap text-gray-1000">{diag.note}</p>
              </Section>
            ) : null}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("diagnose.close", "关闭")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-background-200 p-3">
      <div className="flex items-center gap-1.5 t-label-12 text-gray-700">
        <CheckCircle2 className="size-3.5 text-gray-700" />
        {title}
      </div>
      {children}
    </div>
  );
}
