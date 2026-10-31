import { useEffect, useState } from "react";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentBaseUrl, detectShell } from "@/lib/shell";
import { agentDownloadReady, agentDownloadUrl } from "@/lib/links";

/**
 * Web 形态下的「助手未连接」提示条。
 * 不阻塞界面：房间码仍然可以离线解析，只是不能开服/读本地文件。
 */
export function WebAgentBanner() {
  const [up, setUp] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const shell = detectShell();

  async function ping() {
    setChecking(true);
    try {
      const res = await fetch(`${agentBaseUrl()}/api/health`, { signal: AbortSignal.timeout(2500) });
      setUp(res.ok);
    } catch {
      setUp(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (shell !== "web") return;
    void ping();
    const t = setInterval(ping, 8000);
    return () => clearInterval(t);
  }, [shell]);

  if (shell !== "web" || up !== false) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-700/30 bg-amber-700/10 px-4 py-1.5">
      <AlertTriangle className="size-3.5 shrink-0 text-amber-900" />
      <span className="t-label-12 text-amber-900">
        还差一步：这台电脑上的「开服茶助手」没有启动。启动后，才能读取存档、开服和准备客户端。
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="xs" variant="secondary" onClick={ping} loading={checking} title={agentBaseUrl()}>
          <RefreshCw className="size-3" />
          重新连接
        </Button>
        {agentDownloadReady() ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-amber-900"
            title="下载后双击运行，连接会自动建立"
            onClick={() => window.open(agentDownloadUrl(), "_blank", "noopener,noreferrer")}
          >
            <Download className="size-3" />
            下载开服茶助手
          </Button>
        ) : (
          <span className="t-label-12 text-amber-900/80">安装包请向发你链接的人要</span>
        )}
      </div>
    </div>
  );
}
