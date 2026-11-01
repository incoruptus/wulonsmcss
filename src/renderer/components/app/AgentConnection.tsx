import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FolderOpen, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { agentBaseUrl, detectShell } from "@/lib/shell";
import { agentDownloadReady, agentDownloadUrl } from "@/lib/links";

/**
 * 网页版的「本机助手」状态卡：连接、版本、开机自启、日志。
 * 之前这里只写了一行「仅监听 127.0.0.1」，用户既不知道有没有连上，也没法关掉自启。
 */
export function AgentConnection() {
  const web = detectShell() === "web";
  const agent = useAgentStatus(web);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [appData, setAppData] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (web && agent.status !== "online") return;
    void window.mcss.app
      .info()
      .then((info) => setAppData(info.appData || ""))
      .catch(() => {});
  }, [web, agent.status]);

  useEffect(() => {
    if (web && agent.status !== "online") {
      setAutostart(null);
      return;
    }
    let alive = true;
    void window.mcss.app
      .autostart()
      .then((state) => alive && setAutostart(state.enabled))
      .catch(() => alive && setAutostart(null));
    return () => {
      alive = false;
    };
  }, [web, agent.status]);

  async function toggleAutostart(enabled: boolean) {
    setBusy(true);
    try {
      const state = await window.mcss.app.setAutostart(enabled);
      setAutostart(state.enabled);
      toast.success(state.enabled ? "已设为开机启动" : "已取消开机启动", {
        description: state.enabled ? "下次登录 Windows 时，助手会在后台自己起来。" : "已从启动项移除；已经运行的助手不受影响。",
      });
    } catch (e) {
      toast.error("没有改成开机自启", { description: (e as Error).message });
      setAutostart(enabled);
    } finally {
      setBusy(false);
    }
  }

  function openLog() {
    if (!appData) {
      toast.error("拿不到数据目录，暂时打不开日志");
      return;
    }
    void window.mcss.app.openPath(`${appData}\\wulons-mcss\\agent.log`).catch((e) => {
      toast.error("日志还没生成", { description: (e as Error).message });
    });
  }

  if (!web) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-background-200 p-3">
        <ShieldCheck className="size-4 shrink-0 text-green-900" />
        <span className="t-label-13 text-gray-900">桌面版自带全部本机能力，不需要额外安装助手。</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="t-label-12 text-gray-700">开机自启</span>
          <Button
            size="xs"
            variant="ghost"
            disabled={autostart === null || busy}
            onClick={() => void toggleAutostart(!(autostart ?? false))}
            loading={busy}
          >
            {autostart === null ? "读取中…" : autostart ? "已开启，点击关闭" : "未开启，点击开启"}
          </Button>
        </span>
      </div>
    );
  }

  const tone = agent.status === "online" ? "green" : agent.status === "checking" ? "amber" : "gray";
  const label =
    agent.status === "online" ? "已连接" : agent.status === "checking" ? "检查中" : agent.status === "blocked" ? "连接受阻" : "未连接";

  return (
    <div className="mt-4 rounded-lg bg-background-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone} size="sm">{label}</Badge>
        <span className="t-label-13 text-gray-900">
          {agent.status === "online"
            ? `本机助手${agent.version ? ` v${agent.version}` : ""} 正在后台运行`
            : agent.status === "checking"
              ? "正在检查本机助手…"
              : agent.status === "blocked"
                ? "助手在运行，但这个页面被拒绝访问"
                : "这台电脑上还没有检测到助手"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {agent.status !== "online" && agentDownloadReady() ? (
            <Button size="xs" onClick={() => window.open(agentDownloadUrl(), "_blank", "noopener,noreferrer")}>
              <Download className="size-3" />
              下载安装包
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => void agent.refresh()} loading={agent.refreshing}>
            <RefreshCw className="size-3" />
            重新检测
          </Button>
        </span>
      </div>

      {agent.status === "blocked" && agent.message ? (
        <p className="mt-2 t-label-12 leading-5 text-amber-900">{agent.message}</p>
      ) : null}

      {agent.status === "online" ? (
        <div className="mt-3 space-y-1.5 border-t border-gray-300 pt-3">
          <SwitchRow
            label="开机自动启动助手"
            hint="登录 Windows 后在后台运行，不弹窗口；关闭后仍可在开始菜单手动打开"
            checked={Boolean(autostart)}
            disabled={autostart === null || busy}
            onCheckedChange={(value) => void toggleAutostart(value)}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="t-mono-12 truncate text-gray-700" title={agentBaseUrl()}>{agentBaseUrl()}</span>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={openLog} title="助手日志：连接、配对、启动失败都记在这里">
              <FolderOpen className="size-3" />
              打开日志
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
