import { useEffect, useState } from "react";
import { Copy, Languages, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { copyText } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

const ENGINE: Record<string, string> = {
  mymemory: "MyMemory",
  google: "Google",
  mcim: "MCIM",
  none: "无需翻译",
};

/**
 * 机翻结果
 * ------------------------------------------------------------
 * 日志、Mod 简介里全是英文。选中一段右键「翻译」比切浏览器快得多。
 * 引擎链：MyMemory（国内可达）→ Google。结果在主进程缓存 6 小时。
 */
export function TranslateDialog({
  open,
  onOpenChange,
  text,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  text: string;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState<{ text: string; engine: string; truncated?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await window.mcss.translate.text(text);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-2xl">
      <DialogHeader title={t("translate.title", "翻译")} desc={t("translate.chars", "{n} 个字符 · {engine}", { n: text.length, engine: result?.engine === "none" ? t("translate.engine.none", "无需翻译") : ENGINE[result?.engine ?? ""] ?? t("translate.engine.machine", "机器翻译") })} />
      <DialogBody className="space-y-3">
        <div>
          <div className="t-label-12 mb-1 text-gray-700">{t("translate.source", "原文")}</div>
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background-200 p-2.5 text-[12.5px] leading-5 text-gray-900 scroll-thin">
            {text}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2 t-label-12 text-gray-700">
            <Languages className="size-3.5" /> {t("translate.result", "译文")}
            {result?.truncated ? <span className="text-amber-900">{t("translate.truncated", "（原文太长，只翻了前 3000 字）")}</span> : null}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg bg-background-200 p-3 t-label-13 text-gray-800">
              <Spinner /> {t("translate.translating", "正在翻译…")}
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-700/10 p-2.5 t-label-13 text-red-900">
              {error}
              <Button size="xs" variant="secondary" className="ml-2" onClick={() => void run()}>
                {t("translate.retry", "重试")}
              </Button>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-background-200 p-2.5 text-[13px] leading-6 text-gray-1000 scroll-thin">
              {result?.text || "…"}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => void run()} disabled={loading}>
          <RefreshCw className="size-3.5" /> {t("translate.retranslate", "重翻")}
        </Button>
        <Button
          variant="secondary"
          disabled={!result?.text}
          onClick={async () => {
            (await copyText(result?.text ?? "")) ? toast.success(t("translate.copied", "译文已复制")) : toast.error(t("translate.copyFailed", "复制失败"));
          }}
        >
          <Copy className="size-3.5" /> {t("translate.copy", "复制译文")}
        </Button>
        <Button onClick={() => onOpenChange(false)}>{t("translate.close", "关闭")}</Button>
      </DialogFooter>
    </Dialog>
  );
}
