import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, ClipboardCopy, Wand2 } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { applyChanges, buildConfigPrompt, parseConfigReply, type ParseResult } from "@/lib/ai-config";
import { copyText } from "@/lib/utils";
import type { Instance } from "@/lib/types";

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
        title="AI 配置助手"
        desc="用一句话说清你想要什么样的服务器，把提示词交给任意 AI，再把它的 JSON 贴回来。"
      />
      <DialogBody className="space-y-3">
        <div>
          <div className="t-label-12 mb-1 text-gray-700">你想要什么样的服务器？</div>
          <Input
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            placeholder="例如：4 个人周末一起玩，生存为主，别太肝"
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
              (await copyText(prompt)) ? toast.success("提示词已复制，粘给 AI 即可") : toast.error("复制失败");
            }}
          >
            <ClipboardCopy className="size-3.5" />
            复制提示词
          </Button>
          <span className="t-label-12 self-center text-gray-700">
            提示词里已经带上了当前配置和允许修改的键
          </span>
        </div>

        <div>
          <div className="t-label-12 mb-1 text-gray-700">把 AI 的回复贴在这里</div>
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
                if (!reply.trim()) return toast.info("先贴一段 JSON");
                setResult(parseConfigReply(reply, props));
              }}
            >
              <Wand2 className="size-3.5" />
              校验
            </Button>
            {result ? (
              <Button size="sm" variant="ghost" onClick={reset}>
                重来
              </Button>
            ) : null}
          </div>
        </div>

        {result ? (
          result.error ? (
            <div className="rounded-lg bg-red-700/10 p-2.5 t-label-12 text-red-900">{result.error}</div>
          ) : (
            <div className="space-y-2">
              {result.notes ? <p className="t-label-12 text-gray-800">AI 说明：{result.notes}</p> : null}

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
                          需确认
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="t-label-12 text-gray-700">没有可应用的改动。</div>
              )}

              {result.rejected.length ? (
                <div className="rounded-lg bg-amber-700/10 p-2.5">
                  <div className="t-label-12 mb-1 text-amber-900">这些被拒绝了（不会生效）：</div>
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
          取消
        </Button>
        <Button
          disabled={!result || Boolean(result.error) || !result.changes.length}
          onClick={() => {
            if (!result || !result.changes.length) return;
            onApply(applyChanges(props, result.changes));
            toast.success(`已填入 ${result.changes.length} 项改动`, { description: "记得点「保存」写回服务器配置" });
            reset();
            onOpenChange(false);
          }}
        >
          <Sparkles className="size-3.5" />
          应用到表单
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
