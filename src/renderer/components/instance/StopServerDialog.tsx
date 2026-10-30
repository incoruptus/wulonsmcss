import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-md">
      <DialogHeader
        title="停止服务器？"
        desc={players > 0 ? `现在有 ${players} 人在线，他们会被立刻断开。` : "服务器会先保存世界再退出。"}
      />
      <DialogBody className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg bg-amber-700/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-900" />
          <p className="t-label-13 leading-6 text-amber-900">
            停服会先保存世界，但玩家正在进行的动作不会保留。
            {players > 0 ? "建议先在控制台发一条公告，给大家几十秒下线。" : ""}
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          variant="error"
          onClick={async () => {
            onOpenChange(false);
            await window.mcss.server.stop();
          }}
        >
          停止服务器
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
