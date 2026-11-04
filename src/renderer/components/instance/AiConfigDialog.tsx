import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, ClipboardCopy, Wand2 } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { Callout } from "@/components/ui/callout";
import { applyChanges, buildConfigPrompt, parseConfigReply, type ParseResult } from "@/lib/ai-config";
import { copyText } from "@/lib/utils";
import type { Instance } from "@/lib/types";
import { useI18n } from "@/i18n";

/**
 * AI 配置助手：描述需求 → 复制提示词 → 粘回 JSON → 校验 → 应用。
 * 我们不分发 AI 能力，也不经手用户数据；只做「交接 + 校验」。
 */
export function AiConfigDialog({
  open,
  onOpenChange,
  instance,
  props,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Instance;
  props: Record<string, string>;
  onApply: (next: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const [wish, setWish] = useState("");
  const [reply, setReply] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);

  function reset() {
    setWish("");
    setReply("");
    setResult(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      widthClass="max-w-2xl"
    >
      <DialogHeader
        title={t("ai.title", "AI 配置助手")}
        desc={t("ai.desc", "简要描述你期望的服务器玩法与规则，复制提示词给任意 AI，再把 AI 的回复粘贴到下面；开服茶会检查能改的项目并填入表单。")}
      />
      <DialogBody className="space-y-3">
        <Callout tone="info" title={t("ai.steps.title", "三步就能用")}>
          {t("ai.steps.body", "先写下你想要的玩法，再复制提示词发给任意 AI，最后把 AI 的回复粘贴到下面。开服茶只接受能安全修改的配置项，改完还需要你点「保存」。")}
        </Callout>

        <div>
          <div className="t-label-12 mb-1 text-gray-700">{t("ai.wish.label", "描述你期望的服务器玩法与规则")}</div>
          <Input
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            placeholder={t("ai.wish.placeholder", "例如：4 人周末联机生存，开启死亡不掉落，怪物难度适中")}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const prompt = buildConfigPrompt(
                { mc: instance.mcVersion, loader: instance.loader, players: Number(props["max-players"]) || undefined },
                props,
                wish,
              );
              (await copyText(prompt)) ? toast.success(t("ai.copyPromptDone", "提示词已复制，可发送给任意 AI 工具生成配置")) : toast.error(t("ai.copyFailed", "复制失败"));
            }}
          >
            <ClipboardCopy className="size-3.5" />
            {t("ai.copyPrompt", "复制提示词")}
          </Button>
          <span className="t-label-12 self-center text-gray-700">
            {t("ai.promptHint", "提示词会自动带上当前配置和能改的项目")}
          </span>
        </div>

        <div>
          <div className="t-label-12 mb-1 text-gray-700">{t("ai.reply.label", "粘贴 AI 回复的完整内容")}</div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={6}
            placeholder={'{ "changes": { "difficulty": "normal" }, "notes": "…" }'}
            className="w-full rounded-md bg-background-100 p-2 font-mono text-[12px] text-gray-1000 shadow-geist-border outline-none focus:ring-1 focus:ring-blue-700"
          />
          <div className="mt-1.5 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (!reply.trim()) return toast.info(t("ai.replyEmpty", "请先粘贴 AI 的回复"));
                setResult(parseConfigReply(reply, props));
              }}
            >
              <Wand2 className="size-3.5" />
              {t("ai.check", "检查配置")}
            </Button>
            {result ? (
              <Button size="sm" variant="ghost" onClick={reset}>
                {t("ai.reset", "清空重填")}
              </Button>
            ) : null}
          </div>
        </div>

        {result ? (
          result.error ? (
            <div className="rounded-lg bg-red-700/10 p-2.5 t-label-12 text-red-900">
              <div>{result.error}</div>
              <div className="mt-1 text-red-900/80">
                {t("ai.retryHint", "把 AI 的完整回复重新粘贴一次；如果还是没有配置内容，让它按提示词重新生成。")}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {result.notes ? <p className="t-label-12 text-gray-800">{t("ai.notes", "AI 说明：{notes}", { notes: result.notes })}</p> : null}

              {result.changes.length ? (
                <div className="divide-y divide-gray-300 rounded-lg bg-background-100 shadow-geist-border">
                  {result.changes.map((c) => (
                    <div key={c.key} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                      <span className="t-mono-12 text-gray-1000">{c.key}</span>
                      <span className="t-mono-12 text-gray-700 line-through">{c.from}</span>
                      <span className="text-gray-600">→</span>
                      <span className="t-mono-12 text-green-900">{c.to}</span>
                      {c.level === "warn" ? (
                        <Badge variant="amber" size="sm" title={c.note}>
                          {t("ai.needsConfirm", "需确认")}
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="t-label-12 text-gray-700">{t("ai.noChanges", "未检测到可应用的配置修改。")}</div>
              )}

              {result.rejected.length ? (
                <div className="rounded-lg bg-amber-700/10 p-2.5">
                  <div className="t-label-12 mb-1 text-amber-900">{t("ai.rejected", "以下配置项不在可改范围内，已自动忽略：")}</div>
                  {result.rejected.map((r) => (
                    <div key={r.key} className="t-mono-12 text-amber-900">
                      {r.key} — {r.reason}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("ai.cancel", "取消")}
        </Button>
        <Button
          disabled={!result || Boolean(result.error) || !result.changes.length}
          onClick={() => {
            if (!result || !result.changes.length) return;
            onApply(applyChanges(props, result.changes));
            toast.success(t("ai.applied", "已将 {n} 项配置修改填入表单", { n: result.changes.length }), { description: t("ai.appliedDesc", "配置已填入表单，请点击「保存」使其生效") });
            reset();
            onOpenChange(false);
          }}
        >
          <Sparkles className="size-3.5" />
          {t("ai.apply", "应用到表单")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
