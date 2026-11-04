import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyServerToClient, readManifests, undoServerToClient, type SyncPlan } from "@/lib/server-sync";
import { useI18n } from "@/i18n";

/**
 * 服务端 → 客户端：老玩家回归时把服务端新加的 Mod 补到自己的客户端。
 * 只加不覆盖，复制完写 manifest，随时能撤销。
 */
export function ClientSyncPanel({ plan, mcDir, onSynced }: { plan: SyncPlan; mcDir: string; onSynced: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [undoCount, setUndoCount] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!mcDir) {
      setUndoCount(0);
      return;
    }
    void readManifests(mcDir).then((list) => {
      if (alive) setUndoCount(list.length);
    });
    return () => {
      alive = false;
    };
  }, [mcDir, plan.add.length]);

  async function sync() {
    if (!plan.add.length) return;
    setBusy(true);
    try {
      const res = await applyServerToClient(mcDir, plan.add);
      const history = await readManifests(mcDir);
      setUndoCount(history.length);
      if (res.copied.length) {
        toast.success(t("clientSync.copied", "已向客户端补充 {n} 个模组", { n: res.copied.length }), {
          description: t("clientSync.copiedDesc", "重启客户端后生效，复制的文件可随时撤销。"),
        });
      }
      if (res.failed.length) {
        toast.error(t("clientSync.failed", "{n} 个没复制成功", { n: res.failed.length }), {
          description: res.failed.map((f) => `${f.file}：${f.error}`).slice(0, 3).join("；"),
        });
      }
      if (!res.copied.length && !res.failed.length) {
        toast(t("clientSync.nothing", "没有需要复制的文件"), { description: t("clientSync.nothingDesc", "客户端 mods 目录中已存在同名文件，未覆盖。") });
      }
      onSynced();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    try {
      const res = await undoServerToClient(mcDir);
      setUndoCount((await readManifests(mcDir)).length);
      toast.success(t("clientSync.undone", "已撤销，删除了上次复制的 {n} 个文件", { n: res.removed }), {
        description: res.failed ? t("clientSync.undoneFailed", "有 {n} 个文件未能删除，可能已被移动", { n: res.failed }) : undefined,
      });
      onSynced();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hasSomething = plan.add.length > 0 || plan.conflict.length > 0 || undoCount > 0;
  if (!hasSomething) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-green-800/10 px-3 py-2.5">
      <Server className="size-3.5 shrink-0 text-green-900" />
      {plan.add.length ? (
        <>
          <span className="t-label-12 text-gray-900">
            {t("clientSync.extraPrefix", "服务端比客户端多 ")}<span className="font-medium text-gray-1000">{plan.add.length}</span>{t("clientSync.extraSuffix", " 个双端也要的 Mod")}
            {plan.serverOnly ? t("clientSync.serverOnly", "（另有 {n} 个服务端专用模组，无需安装）", { n: plan.serverOnly }) : ""}
          </span>
          <Button size="sm" onClick={sync} loading={busy} disabled={!mcDir}>
            <CheckCircle2 className="size-3.5" />
            {t("clientSync.installClient", "装到客户端")}
          </Button>
        </>
      ) : (
        <span className="t-label-12 text-gray-900">
          {plan.conflict.length ? t("clientSync.conflict", "有 {n} 个模组版本与服务端不一致，未自动覆盖。", { n: plan.conflict.length }) : t("clientSync.keepLast", "上次同步的文件仍保留在本机。")}
        </span>
      )}

      {plan.conflict.length ? (
        <span className="t-label-12 text-amber-900">{t("clientSync.conflictHint", "版本不一致时，建议通过进服包重建服务器，或手动替换对应文件。")}</span>
      ) : null}

      {undoCount ? (
        <Button size="xs" variant="ghost" className="ml-auto" onClick={undo} disabled={busy}>
          <RotateCcw className="size-3" />
          {t("clientSync.undo", "撤销上次同步")}
        </Button>
      ) : null}
    </div>
  );
}
