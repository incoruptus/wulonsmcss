/**
 * Web 形态的 McssApi 实现：所有能力转发给本机 agent。
 * ------------------------------------------------------------
 * 契约与 Electron 的 preload 完全一致（同名 channel + 事件）；
 * agent 侧只需要实现一份 dispatcher，两种外壳就能共用同一套 UI。
 */

import type { McssApi } from "./api";

interface InvokeEnvelope {
  channel: string;
  args: unknown[];
}

interface EventMessage {
  channel: string;
  payload: unknown;
}

export function createHttpClient(base: string, token: string): McssApi {
  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    ...(token ? { "x-mcss-token": token } : {}),
  });

  async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}/api/invoke`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ channel, args } satisfies InvokeEnvelope),
      });
    } catch (e) {
      throw new Error(`连不上本机助手（${base}）——它启动了吗？`);
    }
    const text = await res.text();
    let data: { result?: T; error?: string } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`助手返回了无法解析的内容：${text.slice(0, 120)}`);
    }
    if (!res.ok || data.error) throw new Error(friendlyAgentError(data.error, res.status));
    return data.result as T;
  }

  /** 把「助手没有这个能力」翻译成人话，而不是把内部 channel 名甩给用户 */
  function friendlyAgentError(error: string | undefined, status: number): string {
    if (error?.startsWith("UNSUPPORTED:")) {
      const channel = error.slice("UNSUPPORTED:".length);
      const name: Record<string, string> = {
        versions: "下载服务端 / 新建实例",
        frp: "内网穿透",
        worlds: "多世界生成",
        sync: "跨设备同步",
        "app:detect-java": "Java 探测",
      };
      const group = channel.split(":")[0];
      const label = name[group] ?? name[channel] ?? channel;
      return `${label}需要桌面版，网页版暂不支持。装一个 Wulon's MCSS 桌面版就能用。`;
    }
    return error || `助手返回 ${status}`;
  }

  /* ---------------- 事件（SSE 单连接，按 channel 分发） ---------------- */

  let source: EventSource | null = null;
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  function dispatch(msg: EventMessage) {
    const set = listeners.get(msg.channel);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(msg.payload);
      } catch {
        /* 单个订阅者出错不影响其它人 */
      }
    }
  }

  function ensureStream() {
    if (source) return;
    const url = `${base}/api/events?token=${encodeURIComponent(token)}`;
    source = new EventSource(url);
    source.onmessage = (e) => {
      try {
        dispatch(JSON.parse(e.data) as EventMessage);
      } catch {
        /* 忽略坏帧 */
      }
    };
  }

  function on(channel: string, cb: (payload: unknown) => void): () => void {
    ensureStream();
    const set = listeners.get(channel) ?? new Set();
    set.add(cb);
    listeners.set(channel, set);
    return () => {
      set.delete(cb);
      if (set.size === 0) listeners.delete(channel);
    };
  }

  const noop = () => {};

  return {
    window: {
      minimize: noop,
      maximize: noop,
      close: noop,
      isMaximized: async () => false,
    },
    env: {
      appData: "",
      userName: "",
      platform: "web",
    },
    net: {
    probe: (opts) => invoke("net:probe", opts),
    ping: (opts) => invoke("net:ping", opts),
  },
  ai: {
    exportBundle: (opts) => invoke("ai:export-bundle", opts),
    docsPath: () => invoke("ai:docs-path"),
  },
  app: {
      info: () => invoke("app:info"),
      openPath: (p: string) => invoke("app:open-path", p),
      openExternal: async (url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      pickJava: () => invoke("app:pick-java"),
      detectJava: () => invoke("app:detect-java"),
      detectLaunchers: () => invoke("app:detect-launchers"),
      aiDocs: () => invoke("app:ai-docs"),
      lanAddress: () => invoke("app:lan-address"),
      installJava: () => invoke("app:install-java"),
    },
    config: {
      read: () => invoke("config:read"),
      write: (patch) => invoke("config:write", patch),
      reset: () => invoke("config:reset"),
    },
    dialog: {
      openFile: (filters) => invoke("dialog:open-file", filters),
      openDirectory: () => invoke("dialog:open-directory"),
      saveFile: (opts) => invoke("dialog:save-file", opts),
    },
    fs: {
      read: (p) => invoke("fs:read", p),
      write: (p, content) => invoke("fs:write", p, content),
      list: (dir) => invoke("fs:list", dir),
      exists: (p) => invoke("fs:exists", p),
      mkdir: (p) => invoke("fs:mkdir", p),
      remove: (p) => invoke("fs:remove", p),
      copy: (src, dest) => invoke("fs:copy", src, dest),
    },
    server: {
      preflight: (instanceId) => invoke("server:preflight", instanceId),
      start: (instanceId) => invoke("server:start", instanceId),
      stop: () => invoke("server:stop"),
      command: (cmd) => invoke("server:command", cmd),
      status: () => invoke("server:status"),
      memory: () => invoke("server:memory"),
      pid: () => invoke("server:pid"),
      onOutput: (cb) => on("server:output", (p) => cb(p as never)),
      onStatus: (cb) => on("server:status", (p) => cb(p as never)),
    },
    props: {
      read: (p) => invoke("props:read", p),
      write: (p, props) => invoke("props:write", p, props),
    },
    mods: {
      scan: (dir) => invoke("mods:scan", dir),
      meta: (jarPath) => invoke("mods:meta", jarPath),
      disable: (jarPath) => invoke("mods:disable", jarPath),
      enable: (jarPath) => invoke("mods:enable", jarPath),
      resolveModrinth: (list) => invoke("mods:resolve-modrinth", list),
    },
    backup: {
      list: (serverDir) => invoke("backup:list", serverDir),
      create: (serverDir) => invoke("backup:create", serverDir),
      restore: (serverDir, name) => invoke("backup:restore", serverDir, name),
      remove: (serverDir, name) => invoke("backup:remove", serverDir, name),
    },
    versions: {
      minecraft: () => invoke("versions:minecraft"),
      fabricLoaders: (mc) => invoke("versions:fabric-loaders", mc),
      install: (opts) => invoke("versions:install", opts),
      onProgress: (cb) => on("versions:progress", (p) => cb(p as never)),
    },
    modrinth: {
      search: (q, opts) => invoke("modrinth:search", q, opts),
      versions: (projectId, opts) => invoke("modrinth:versions", projectId, opts),
      install: (opts) => invoke("modrinth:install", opts),
    },
    client: {
      prepare: (opts) => invoke("client:prepare", opts),
      onProgress: (cb) => on("client:progress", (p) => cb(p as never)),
      addServer: (opts) => invoke("client:add-server", opts),
      exportMrpack: (opts) => invoke("client:export-mrpack", opts),
    },
    frp: {
      start: (profile) => invoke("frp:start", profile),
      stop: () => invoke("frp:stop"),
      status: () => invoke("frp:status"),
      onLog: (cb) => on("frp:log", (p) => cb(p as never)),
      onStatus: (cb) => on("frp:status", (p) => cb(p as never)),
    },
  };
}
