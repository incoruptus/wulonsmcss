import { useEffect } from "react";
import { AlertTriangle, Download, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectShell } from "@/lib/shell";
import { agentDownloadReady, agentDownloadUrl } from "@/lib/links";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useConfig } from "@/stores/config";
import type { AppConfig } from "@/lib/types";

/**
 * Web 形态下的「助手连不上」提示条。
 * 不阻塞界面：房间码仍然可以离线解析，只是不能开服/读本地文件。
 * health 通了还要再确认一次调用能过，否则配对失败会被误报成「已连接」。
 */
export function WebAgentBanner() {
  const shell = detectShell();
  const agent = useAgentStatus(shell === "web");
  const loadConfig = useConfig((s) => s.load);

  // 页面先打开、助手后装上时，启动那一刻的 config.read 是失败的：
  // 一旦连上就重新读一次，否则后面新建实例会把本机已有实例覆盖掉。
  useEffect(() => {
    if (shell !== "web" || agent.status !== "online") return;
    void (async () => {
      const before = useConfig.getState().cfg;
      await loadConfig();
      const after = useConfig.getState().cfg;
      // 助手离线时用户做过的选择（模式、已完成引导）不能被一次重读抹掉
      const restore: Partial<AppConfig> = {};
      if (before.modeAsked && !after.modeAsked) {
        restore.mode = before.mode;
        restore.modeAsked = true;
      }
      if (before.setupComplete && !after.setupComplete) restore.setupComplete = true;
      if (Object.keys(restore).length) await useConfig.getState().patch(restore);
    })();
  }, [shell, agent.status, loadConfig]);

  if (shell !== "web" || agent.status === "online" || agent.status === "checking") return null;

  const blocked = agent.status === "blocked";
  const isEdge = /Edg\//.test(navigator.userAgent);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-700/30 bg-amber-700/10 px-4 py-1.5">
      <AlertTriangle className="size-3.5 shrink-0 text-amber-900" />
      <span className="t-label-12 text-amber-900">
        {blocked
          ? "本机助手在运行，但这个页面连不上它。先刷新页面；仍然不行就重启助手。"
          : "还差一步：这台电脑上的「开服茶助手」没有启动。装好并启动后，才能读取存档、开服和准备客户端。"}
        {blocked
          ? isEdge
            ? " Edge 询问是否允许访问本地网络时，请点允许。"
            : ""
          : " 如果任务管理器里已经有 mcss-agent.exe，点「重新连接」；Edge 询问本地网络时请点允许。"}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="xs" variant="ghost" className="text-amber-900" onClick={() => window.location.reload()} title="清掉旧页面缓存，重新加载最新版本">
          <RotateCw className="size-3" />
          刷新页面
        </Button>
        <Button size="xs" variant="secondary" onClick={() => void agent.refresh()} loading={agent.refreshing}>
          <RefreshCw className="size-3" />
          重新连接
        </Button>
        {agentDownloadReady() ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-amber-900"
            title="下载后双击安装；助手在后台运行，没有窗口"
            onClick={() => window.open(agentDownloadUrl(), "_blank", "noopener,noreferrer")}
          >
            <Download className="size-3" />
            下载安装包
          </Button>
        ) : (
          <span className="t-label-12 text-amber-900/80">安装包请向发你链接的人要</span>
        )}
      </div>
    </div>
  );
}
