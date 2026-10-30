/**
 * Web 链路端到端校验：起 agent → 走一遍 httpClient 会用的接口。
 * 不启动真实服务器（那个由 scripts/frp-e2e.cjs 和人工验证覆盖），只校验契约。
 *
 *   node scripts/web-e2e.cjs
 */
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXE = path.join(ROOT, "agent", "target", "release", process.platform === "win32" ? "mcss-agent.exe" : "mcss-agent");
const PORT = 28474;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "e2e-token";

const env = {
  ...process.env,
  MCSS_CONFIG: path.join(ROOT, "config.json"),
  MCSS_PORT: String(PORT),
  MCSS_TOKEN: TOKEN,
  MCSS_NO_OPEN: "1",
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function invoke(channel, args = [], token = TOKEN) {
  const res = await fetch(`${BASE}/api/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-mcss-token": token } : {}) },
    body: JSON.stringify({ channel, args }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

async function waitHealth(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const agent = spawn(EXE, [], { env, stdio: ["ignore", "pipe", "pipe"] });
  agent.stdout.on("data", (d) => process.stdout.write("[agent] " + d));
  agent.stderr.on("data", (d) => {
    const s = String(d);
    if (!/Compiling|Finished/.test(s)) process.stderr.write("[agent!] " + s);
  });

  try {
    check("agent 启动并能响应 /api/health", await waitHealth());

    const noToken = await invoke("config:read", [], "");
    check("无令牌请求被拒（401）", noToken.status === 401, `status=${noToken.status}`);

    const cfg = await invoke("config:read");
    const instances = cfg.data?.result?.instances ?? [];
    check("config:read 返回实例列表", Array.isArray(instances) && instances.length > 0, `${instances.length} 个实例`);

    const status = await invoke("server:status");
    check("server:status 返回合法状态", ["stopped", "starting", "running", "stopping"].includes(status.data?.result), String(status.data?.result));

    // 资源库三项：详情、中文简介、任意文本机翻（网页版与桌面版必须同能力）
    const project = await invoke("modrinth:project", ["AANobbMI"]);
    check(
      "modrinth:project 返回项目详情",
      project.data?.result?.title === "Sodium" && typeof project.data?.result?.body === "string",
      `${project.data?.result?.title || project.data?.error} · body ${project.data?.result?.body?.length ?? 0} 字符`,
    );

    const zh = await invoke("modrinth:translate", ["AANobbMI"]);
    check(
      "modrinth:translate 返回中文简介",
      typeof zh.data?.result?.translated === "string" && zh.data.result.translated.length > 5,
      (zh.data?.result?.translated || zh.data?.error || "").slice(0, 40),
    );

    const tr = await invoke("translate:text", ["Server started in 5.2 seconds"]);
    check(
      "translate:text 能机翻任意文本",
      typeof tr.data?.result?.text === "string" && tr.data.result.text.length > 0 && tr.data.result.text !== "Server started in 5.2 seconds",
      tr.data?.result?.text || tr.data?.error,
    );

    const unknown = await invoke("nope:nothing");
    check("未知 channel 返回可读错误", typeof unknown.data?.error === "string" && unknown.data.error.includes("还没有实现"), unknown.data?.error);

    const wrong = await invoke("config:read", [], "wrong-token");
    check("错误令牌被拒（401）", wrong.status === 401);

    // SSE：能建立事件流
    const ctrl = new AbortController();
    const sse = await fetch(`${BASE}/api/events?token=${encodeURIComponent(TOKEN)}`, {
      signal: ctrl.signal,
      headers: { Accept: "text/event-stream" },
    });
    check("SSE 事件流可建立", sse.ok && (sse.headers.get("content-type") || "").includes("text/event-stream"), sse.headers.get("content-type"));
    // 不主动 abort：留给下面 kill agent 时自然断开，避免触发 libuv 断言
  } catch (e) {
    check("未捕获异常", false, e.message);
  } finally {
    agent.kill();
    await new Promise((r) => setTimeout(r, 400));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exitCode = failed.length ? 1 : 0;
})();
