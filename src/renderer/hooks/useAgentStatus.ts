import { useCallback, useEffect, useRef, useState } from "react";
import { agentBaseUrl } from "@/lib/shell";

export type AgentStatus = "checking" | "offline" | "online" | "blocked";

export interface AgentState {
  status: AgentStatus;
  version?: string;
  /** 助手在跑，但当前页面没能完成配对/调用 */
  message?: string;
}

/**
 * 网页版「本机助手是否可用」的唯一判断。
 * health 只说明端口开着；再调一次 app.info 才能确认令牌配对真的通了。
 */
export async function checkAgent(): Promise<AgentState> {
  let health: Response;
  try {
    health = await fetch(`${agentBaseUrl()}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    return { status: "offline" };
  }
  if (!health.ok) return { status: "offline" };
  let version = "";
  try {
    const data = (await health.json()) as { version?: string };
    version = data.version || "";
  } catch {
    /* health 不是 JSON 也继续往下试 */
  }
  try {
    // 助手端口开着但卡死时，不能让首屏永远停在「检查中」
    const info = (await Promise.race([
      window.mcss.app.info(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("助手响应超时")), 3500)),
    ])) as { version?: string };
    return { status: "online", version: info?.version || version };
  } catch (e) {
    return { status: "blocked", version, message: (e as Error).message };
  }
}

export function useAgentStatus(active = true) {
  const [state, setState] = useState<AgentState>({ status: "checking" });
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const statusRef = useRef<AgentStatus>("checking");
  const checking = useRef(false);

  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const refresh = useCallback(async (silent = false) => {
    // 轮询时不要把状态打回 checking：否则离线提示条每 5 秒闪一次
    if (checking.current) return { status: statusRef.current } as AgentState;
    checking.current = true;
    if (!silent) setRefreshing(true);
    try {
      const next = await checkAgent();
      if (alive.current) setState(next);
      return next;
    } finally {
      checking.current = false;
      if (alive.current && !silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!active) {
      return () => {
        alive.current = false;
      };
    }
    void refresh();
    // 没连上时重试；连上后继续低频探活，助手崩了要让界面知道
    const timer = setInterval(() => {
      void refresh(true);
    }, 5000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [active, refresh]);

  return { ...state, refresh, refreshing };
}
