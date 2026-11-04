/**
 * Web 形态的 McssApi 实现：所有能力转发给本机 agent。
 * ------------------------------------------------------------
 * 契约与 Electron 的 preload 完全一致（同名 channel + 事件）；
 * agent 侧只需要实现一份 dispatcher，两种外壳就能共用同一套 UI。
 */

import type { McssApi } from "./api";
import { isLoopbackUrl, readAgentToken, storeAgentToken } from "./shell";
import { tGlobal } from "../i18n/core";

interface InvokeEnvelope {
  channel: string;
  args: unknown[];
}

interface EventMessage {
  channel: string;
  payload: unknown;
}

export function createHttpClient(base: string, token: string): McssApi {
  // 纵深防御：即使调用方传了非本机地址，也绝不把配对令牌发出去
  const trusted = isLoopbackUrl(base);
  // 令牌可能被 /api/pair 换新，所以每次请求都读当前值，而不是建客户端时固定
  let currentToken = token || readAgentToken();
  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    ...(trusted && currentToken ? { "x-mcss-token": currentToken } : {}),
  });

  /** 网页第一次打开时没有令牌：向本机助手换一个，并写回 localStorage */
  async function pair(): Promise<boolean> {
    if (!trusted) return false;
    try {
      const res = await fetch(`${base}/api/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { token?: string };
      if (!data.token) return false;
      currentToken = data.token;
      storeAgentToken(data.token);
      resetStream();
      return true;
    } catch {
      return false;
    }
  }

  async function post(envelope: InvokeEnvelope): Promise<Response> {
    return fetch(`${base}/api/invoke`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(envelope),
    });
  }

  async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    let res: Response;
    try {
      res = await post({ channel, args } satisfies InvokeEnvelope);
      if (res.status === 401 && (await pair())) {
        res = await post({ channel, args } satisfies InvokeEnvelope);
      }
    } catch (e) {
      throw new Error(tGlobal("httpClient.connectFailed", "无法连接本机助手（{base}），请确认其是否已启动。", { base }));
    }
    const text = await res.text();
    let data: { result?: T; error?: string } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(tGlobal("httpClient.badResponse", "助手返回了无法解析的内容：{text}", { text: text.slice(0, 120) }));
    }
    if (!res.ok || data.error) throw new Error(friendlyAgentError(data.error, res.status));
    return data.result as T;
  }

  /** 把「助手没有这个能力」翻译成人话，而不是把内部 channel 名甩给用户 */
  function friendlyAgentError(error: string | undefined, status: number): string {
    if (error?.startsWith("UNSUPPORTED:")) {
      const channel = error.slice("UNSUPPORTED:".length);
      const name: Record<string, string> = {
        versions: tGlobal("httpClient.cap.versions", "下载服务端 / 新建服务器"),
        frp: tGlobal("httpClient.cap.frp", "中转线路"),
        worlds: tGlobal("httpClient.cap.worlds", "多世界生成"),
        sync: tGlobal("httpClient.cap.sync", "跨设备同步"),
        "app:detect-java": tGlobal("httpClient.cap.detectJava", "Java 探测"),
      };
      const group = channel.split(":")[0];
      const label = name[group] ?? name[channel] ?? channel;
      return tGlobal(
        "httpClient.unsupported",
        "{label}需要桌面版，网页版暂不支持，安装 Wulon's MCSS 桌面版后即可使用。",
        { label },
      );
    }
    if (status === 401) {
      return tGlobal(
        "httpClient.notPaired",
        "这台浏览器还没有和本机助手配对。刷新页面会自动重新配对；仍然失败时，重新启动助手。",
      );
    }
    return error || tGlobal("httpClient.status", "助手返回 {status}", { status });
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
    const url = trusted ? `${base}/api/events?token=${encodeURIComponent(currentToken)}` : `${base}/api/events`;
    source = new EventSource(url);
    source.onmessage = (e) => {
      try {
        dispatch(JSON.parse(e.data) as EventMessage);
      } catch {
        /* 忽略坏帧 */
      }
    };
  }

  /** 配对换到新令牌后，旧 SSE 连接会一直 401：重建一次，别让控制台静默失联 */
  function resetStream() {
    if (!source) return;
    source.close();
    source = null;
    if (listeners.size > 0) ensureStream();
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
    doctor: () => invoke("net:doctor"),
    upnpMap: (opts) => invoke("net:upnp-map", opts.port),
    upnpUnmap: (opts) => invoke("net:upnp-unmap", opts.port),
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
      autostart: () => invoke("app:autostart"),
      setAutostart: (enabled: boolean) => invoke("app:autostart-set", enabled),
      // 网页版刷新即是最新，没有可替换的应用层；设置页会据此显示说明而不是报错
      updateCheck: () => Promise.reject(new Error(tGlobal("httpClient.updateIsLatest", "网页版刷新后即为最新版本"))),
      updateDownload: () => Promise.reject(new Error(tGlobal("httpClient.updateNotNeeded", "网页版无需下载更新"))),
      updateApply: () => Promise.reject(new Error(tGlobal("httpClient.updateNotApply", "网页版无需应用更新"))),
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
      drives: () => invoke("fs:drives"),
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
      snapshot: (serverDir) => invoke("backup:snapshot", serverDir),
      snapshots: (serverDir) => invoke("backup:snapshots", serverDir),
      restoreSnapshot: (serverDir, name) => invoke("backup:restore-snapshot", serverDir, name),
    },
    versions: {
      minecraft: () => invoke("versions:minecraft"),
      ecosystem: (list) => invoke("versions:ecosystem", list),
      fabricLoaders: (mc) => invoke("versions:fabric-loaders", mc),
      serverBuilds: (serverType, mc) => invoke("versions:server-builds", serverType, mc),
      detectServer: (dir) => invoke("versions:detect-server", dir),
      install: (opts) => invoke("versions:install", opts),
      onProgress: (cb) => on("versions:progress", (p) => cb(p as never)),
    },
    modrinth: {
      search: (q, opts) => invoke("modrinth:search", q, opts),
      project: (projectId) => invoke("modrinth:project", projectId),
      translate: (projectId) => invoke("modrinth:translate", projectId),
      versions: (projectId, opts) => invoke("modrinth:versions", projectId, opts),
      install: (opts) => invoke("modrinth:install", opts),
    },
    translate: {
      text: (text, opts) => invoke("translate:text", text, opts),
    },
    client: {
      scan: (dir) => invoke("client:scan", dir),
      prepare: (opts) => invoke("client:prepare", opts),
      onProgress: (cb) => on("client:progress", (p) => cb(p as never)),
      addServer: (opts) => invoke("client:add-server", opts),
      launch: (opts) => invoke("client:launch", opts),
      exportMrpack: (opts) => invoke("client:export-mrpack", opts),
    },
    frp: {
      start: (profile) => invoke("frp:start", profile),
      stop: () => invoke("frp:stop"),
      status: () => invoke("frp:status"),
      onLog: (cb) => on("frp:log", (p) => cb(p as never)),
      onStatus: (cb) => on("frp:status", (p) => cb(p as never)),
    },
    proc: {
      run: (opts) => invoke("proc:run", opts),
    },
  };
}
