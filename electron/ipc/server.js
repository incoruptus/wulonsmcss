const { spawn } = require('child_process')
const { join } = require('path')
const { existsSync, writeFileSync, readFileSync, readdirSync } = require('fs')
const { createInterface } = require('readline')

/**
 * Forge 1.17+ / NeoForge 的启动参数文件（libraries/net/.../<ver>/win_args.txt）。
 * 找到就说明这家不能 -jar 启动；找不到返回 null，维持原来的 -jar 逻辑。
 */
function findArgsFile(dir) {
  for (const ns of ['neoforged/neoforge', 'minecraftforge/forge']) {
    const base = join(dir, 'libraries', 'net', ...ns.split('/'))
    try {
      for (const ver of readdirSync(base)) {
        const candidate = join(base, ver, 'win_args.txt')
        if (existsSync(candidate)) return candidate
      }
    } catch (e) {}
  }
  return null
}

let serverProcess = null
let stopKillTimer = null
let rl = null
let rlErr = null
let outputCallbacks = []
let statusCallbacks = []
let serverDir = ''
let javaPath = ''
// stopped | starting | running
let serverState = 'stopped'

// Split a JVM argument string into an argv array, honouring "double" and 'single' quotes
// so that paths containing spaces (e.g. -javaagent:"C:\my tools\agent.jar") stay intact.
function splitArgs(input) {
  if (!input) return []
  const out = []
  let cur = ''
  let quote = null
  let has = false
  for (const ch of String(input)) {
    if (quote) {
      if (ch === quote) quote = null
      else { cur += ch; has = true }
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (has) { out.push(cur); cur = ''; has = false }
    } else {
      cur += ch
      has = true
    }
  }
  if (has) out.push(cur)
  return out
}

function start(java, dir, jvmArgs) {
  if (serverProcess) return { ok: false, error: '服务器已在运行' }

  javaPath = java || 'java'
  // 目录为空时绝不能落到 process.cwd()：那会在应用自己的目录里起一个服务器，
  // 生成 world/logs/crash-reports，而用户以为开的是他那台服。
  if (!dir) {
    emitOutput('ERROR', '实例没有配置服务器目录，请先在实例设置里指定')
    emitStatus('stopped')
    return { ok: false, error: '实例目录为空' }
  }
  serverDir = dir

  // Forge 1.17+ / NeoForge 不能用 -jar：真实参数在 libraries/.../win_args.txt 里，
  // 内存要写进 user_jvm_args.txt。判据是产物文件，不是猜核心类型。
  const argsFile = findArgsFile(serverDir)
  let jar = null
  if (!argsFile) {
    jar = join(serverDir, 'fabric-server-launch.jar')
    if (!existsSync(jar)) jar = join(serverDir, 'server.jar')
    if (!existsSync(jar)) {
      emitOutput('ERROR', `未在 ${serverDir} 找到 argsfile、fabric-server-launch.jar 或 server.jar`)
      emitStatus('stopped')
      return { ok: false, error: '未找到可启动的服务端' }
    }
  }
  // 只有传进来的是具体路径时才检查存在性，避免把 PATH 里的 "java" 误判成缺失
  if (/[\\/]/.test(javaPath) && !existsSync(javaPath)) {
    emitOutput('ERROR', `Java 路径不存在：${javaPath}（请在设置中重新指定）`)
    emitStatus('stopped')
    return { ok: false, error: 'Java 路径不存在' }
  }

  const jvm = splitArgs(jvmArgs)
  let args
  if (argsFile) {
    // 这两家把内存写在 user_jvm_args.txt 里，命令行只引用它。
    // 只更新我们自己的 managed 块，保留用户手写的注释/参数。
    const userArgs = join(serverDir, 'user_jvm_args.txt')
    try {
      writeManagedJvmArgs(userArgs, jvm)
    } catch (e) {
      emitOutput('WARN', `写 user_jvm_args.txt 失败：${e.message}`)
    }
    args = ['@user_jvm_args.txt', `@${argsFile}`, 'nogui']
    emitOutput('INFO', `检测到 Forge/NeoForge 启动参数：${argsFile}`)
  } else {
    args = [...jvm, '-jar', jar, 'nogui']
  }
  emitOutput('INFO', `启动服务器：${javaPath} ${args.join(' ')}`)
  emitStatus('starting')

  let proc
  try {
    proc = spawn(javaPath, args, {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
  } catch (e) {
    emitOutput('ERROR', `启动失败：${e.message}`)
    emitStatus('stopped')
    return { ok: false, error: e.message }
  }

  serverProcess = proc

  // spawn 失败（如 ENOENT / EACCES）会异步触发 error，没有监听器会直接崩掉主进程
  proc.on('error', (err) => {
    emitOutput('ERROR', `服务器进程错误：${err.message}`)
    if (serverProcess === proc) serverProcess = null
    cleanupStreams()
    emitStatus('stopped')
  })

  proc.stdin.on('error', () => { /* 进程退出时写入会 EPIPE，忽略即可 */ })

  rl = createInterface({ input: proc.stdout })
  rl.on('line', (line) => {
    emitOutput('INFO', line)
    // 服务端真正就绪的标志
    if (serverState === 'starting' && line.includes('Done (') && line.includes('!')) {
      emitStatus('running')
    }
  })

  rlErr = createInterface({ input: proc.stderr })
  rlErr.on('line', (line) => emitOutput('ERROR', line))

  proc.on('close', (code, signal) => {
    if (stopKillTimer) { clearTimeout(stopKillTimer); stopKillTimer = null }
    cleanupStreams()
    const wasCurrent = serverProcess === proc
    if (wasCurrent) serverProcess = null
    const suffix = signal ? `，信号 ${signal}` : ''
    emitOutput('INFO', `服务器进程退出 (代码 ${code == null ? '未知' : code}${suffix})`)
    if (wasCurrent) emitStatus('stopped')
  })

  return { ok: true }
}

function cleanupStreams() {
  if (rl) { rl.close(); rl = null }
  if (rlErr) { rlErr.close(); rlErr = null }
}

function stop() {
  const proc = serverProcess
  if (!proc) return false
  // 在启动阶段也要能停：指令会排在 stdin 缓冲里，等服务端读到就执行
  sendCommand('stop')
  if (stopKillTimer) clearTimeout(stopKillTimer)
  stopKillTimer = setTimeout(() => {
    if (serverProcess === proc) {
      emitOutput('WARN', '服务器 10 秒内未退出，强制结束进程')
      try { proc.kill() } catch (e) {}
      serverProcess = null
      cleanupStreams()
      emitStatus('stopped')
    }
  }, 10000)
  return true
}

/**
 * 停止并等进程真的退出（退出应用时用）。
 * stop() 只是发指令 + 10 秒后强杀；如果主进程紧接着 quit，这两个回调都不会再跑，
 * java 会变成孤儿并占着端口。这里返回一个 Promise，让 before-quit 能等。
 */
function stopAndWait(timeoutMs = 12000) {
  return new Promise((resolve) => {
    const proc = serverProcess;
    if (!proc) return resolve(true);
    let done = false;
    const off = onStatus((s) => {
      if (s !== "stopped" || done) return;
      done = true;
      off();
      if (stopKillTimer) { clearTimeout(stopKillTimer); stopKillTimer = null; }
      resolve(true);
    });
    stop();
    setTimeout(() => {
      if (done) return;
      done = true;
      off();
      try { proc.kill(); } catch (e) {}
      if (serverProcess === proc) {
        serverProcess = null;
        cleanupStreams();
        emitStatus("stopped");
      }
      resolve(false);
    }, timeoutMs);
  });
}

const JVM_START = "# >>> Wulon's MCSS 管理的内存参数（不要手改这一段）>>>";
const JVM_END = "# <<< Wulon's MCSS 管理的内存参数 <<<";

/** 保留用户自己的行，只替换我们管理的那一段 */
function writeManagedJvmArgs(file, args) {
  let existing = "";
  try {
    existing = readFileSync(file, "utf-8");
  } catch (e) {}
  const cleaned = existing
    .replace(new RegExp(`^${JVM_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?^${JVM_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n?`, "m"), "")
    .trimEnd();
  const block = [JVM_START, ...args, JVM_END].join("\n");
  writeFileSync(file, `${cleaned ? `${cleaned}\n\n` : ""}${block}\n`, "utf-8");
}

function sendCommand(cmd) {
  const line = String(cmd == null ? '' : cmd).replace(/[\r\n]+/g, ' ').trim()
  if (!line) return false
  if (!serverProcess || !serverProcess.stdin || !serverProcess.stdin.writable) {
    emitOutput('WARN', '服务器未运行，指令未发送')
    return false
  }
  try {
    serverProcess.stdin.write(line + '\n')
    // 服务端不会把控制台输入回显到日志里，这里补一行，方便在控制台看到自己发了什么
    emitOutput('INFO', `> ${line}`)
    return true
  } catch (e) {
    emitOutput('ERROR', `指令发送失败：${e.message}`)
    return false
  }
}

function emitOutput(level, message) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const entry = { timestamp: ts, level, message }
  outputCallbacks.forEach(cb => cb(entry))
}

function emitStatus(status) {
  serverState = status
  statusCallbacks.forEach(cb => cb(status))
}

function onOutput(cb) { outputCallbacks.push(cb); return () => { outputCallbacks = outputCallbacks.filter(c => c !== cb) } }
function onStatus(cb) { statusCallbacks.push(cb); return () => { statusCallbacks = statusCallbacks.filter(c => c !== cb) } }
function getStatus() { return serverState }
function getPid() { return serverProcess ? serverProcess.pid : null }

function getMemory() {
  if (!serverProcess || !serverProcess.pid) return 0
  try {
    const { execSync } = require('child_process')
    const result = execSync('tasklist /FO CSV /NH /FI "PID eq ' + serverProcess.pid + '"', { encoding: 'utf8', timeout: 3000 })
    // tasklist CSV: "image.exe","pid","session","session#","memusage"
    const parts = result.split('","')
    if (parts.length >= 5) {
      const memStr = parts[4].replace(/[^\d]/g, '')
      return parseInt(memStr) * 1024 // KB to bytes
    }
  } catch(e) {}
  return 0
}

module.exports = { start, stop, stopAndWait, sendCommand, onOutput, onStatus, getStatus, getPid, getMemory, findArgsFile }
