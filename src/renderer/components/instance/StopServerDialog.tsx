import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n";

/**
 * 统一的停服确认。
 * 首页的大红按钮和控制台里的 /stop 必须是同一个安全级别：
 * 在线玩家会被立刻断开，正在挖的矿/打的怪进度可能丢，必须先说清楚。
 */
export function StopServerDialog({
  open,
  onOpenChange,
  players,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  players: number;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-md">
      <DialogHeader
        title={t("stop.title", "停止服务器？")}
        desc={players > 0 ? t("stop.descPlayers", "当前有 {n} 名玩家在线，关闭后将立即断开连接。", { n: players }) : t("stop.descIdle", "服务器会先保存世界再退出。")}
      />
      <DialogBody className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg bg-amber-700/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-900" />
          <p className="t-label-13 leading-6 text-amber-900">
            {t("stop.body", "停服会先保存世界，但玩家正在进行的动作不会保留。")}
            {players > 0 ? t("stop.bodyAdvice", "建议先在控制台发布公告，给玩家留出下线时间。") : ""}
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("stop.cancel", "取消")}
        </Button>
        <Button
          variant="error"
          onClick={async () => {
            onOpenChange(false);
            await window.mcss.server.stop();
          }}
        >
          {t("stop.confirm", "停止服务器")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
