import { Gamepad2, Server, Sparkles } from "lucide-react";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/overlay";
import { useConfig } from "@/stores/config";
import type { AppMode } from "@/lib/types";
import { cx } from "@/lib/utils";

/**
 * 模式选择：只问一次
 * ------------------------------------------------------------
 * 玩家模式是把「去朋友那儿玩」摆在第一屏，服主模式是把「我这台服现在怎么样」摆在第一屏。
 * 两边能力完全一样，只是默认给你看的东西不同，所以这个选择永远可以在侧栏改回去。
 */
export function ModePicker({ open }: { open: boolean }) {
  const setMode = useConfig((s) => s.setMode);
  const patch = useConfig((s) => s.patch);

  function choose(mode: AppMode) {
    void setMode(mode);
  }

  /** 不确定的人不该被三道门逼着选；先让人看看界面，之后随时能切 */
  function lookAround() {
    void patch({ mode: "host", modeAsked: true, setupComplete: true });
  }

  return (
    <Dialog open={open} onOpenChange={() => {}} widthClass="max-w-2xl" hideClose>
      <DialogHeader
        title="你主要想做什么？"
        desc="这只决定首页先给你看什么，不影响功能——随时可以在左下角切换。"
      />
      <DialogBody className="space-y-2.5">
        <Choice
          icon={<Gamepad2 className="size-5" />}
          title="去朋友的服务器玩"
          desc="粘一个房间码或者地址，我告诉你还差什么、能不能直接进。"
          onClick={() => choose("player")}
        />
        <Choice
          icon={<Server className="size-5" />}
          title="开一台服务器，让朋友来玩"
          desc="建服、装 Mod 或插件、开控制台、备份世界、发邀请链接。"
          onClick={() => choose("host")}
        />
        <Choice
          icon={<Sparkles className="size-5" />}
          title="两个都要"
          desc="先按开服来（首页是你的服务器），想玩的时候左下角一键切过去。"
          onClick={() => choose("host")}
        />
        <p className="pt-1 t-label-12 text-gray-700">
          提示：同一个程序里两种模式共存，服务器、Mod、存档都在本机，不会因为切换模式丢东西。
        </p>
        <button className="pt-1 text-left t-label-12 text-brand-700 hover:underline" onClick={lookAround}>
          我还不确定，先看看界面 →
        </button>
      </DialogBody>
    </Dialog>
  );
}

function Choice({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-3 rounded-xl bg-background-200 p-3.5 text-left transition-colors",
        "hover:bg-gray-100 focus-visible:outline-none",
      )}
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">{icon}</span>
      <span className="min-w-0">
        <span className="t-label-14 block font-medium text-gray-1000">{title}</span>
        <span className="t-label-13 mt-0.5 block text-gray-800">{desc}</span>
      </span>
    </button>
  );
}
