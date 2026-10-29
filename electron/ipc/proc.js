/**
 * 跑一个子进程并等它结束
 * ------------------------------------------------------------
 * Forge / NeoForge 不是"下个 jar 就完事"：要跑安装器（几分钟、输出很长），
 * 装完还要从产物里判断到底成没成。所以需要一个通用的"跑命令、拿结果"能力。
 *
 * 只回尾部输出：安装器的进度条不是给人看的，我们要的是"装没装成、失败原因"。
 */

const { spawn } = require("child_process");

const TAIL_LINES = 200;

function tail(text, lines = TAIL_LINES) {
  const all = String(text || "").split(/\r?\n/);
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

/**
 * @param {{command: string[], cwd?: string, timeoutMs?: number}} opts
 * @returns {Promise<{code:number|null, stdoutTail:string, stderrTail:string, timedOut:boolean}>}
 */
function run({ command, cwd, timeoutMs = 30 * 60 * 1000 }) {
  return new Promise((resolve) => {
    const list = Array.isArray(command) ? command.filter((c) => typeof c === "string" && c.length) : [];
    if (!list.length) {
      resolve({ code: null, stdoutTail: "", stderrTail: "没有可执行的命令", timedOut: false });
      return;
    }
    let child;
    try {
      child = spawn(list[0], list.slice(1), {
        cwd: cwd || undefined,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      resolve({ code: null, stdoutTail: "", stderrTail: e.message, timedOut: false });
      return;
    }

    let out = "";
    let err = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch (e) {}
    }, Math.max(10_000, Number(timeoutMs) || 30 * 60 * 1000));

    child.stdout?.on("data", (d) => {
      out += String(d);
      if (out.length > 4_000_000) out = out.slice(-2_000_000);
    });
    child.stderr?.on("data", (d) => {
      err += String(d);
      if (err.length > 4_000_000) err = err.slice(-2_000_000);
    });

    const done = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdoutTail: tail(out), stderrTail: tail(err), timedOut });
    };

    child.on("error", (e) => {
      err += `\n${e.message}`;
      done(null);
    });
    child.on("close", (code) => done(code));
  });
}

module.exports = { run, tail };
