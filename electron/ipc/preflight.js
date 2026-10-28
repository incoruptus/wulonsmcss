/**
 * 开服前预检
 * ------------------------------------------------------------
 * 目标：把「点启动 → 闪退 → 一屏红字」变成「启动前告诉你会怎样、点一下就能修」。
 * 这里只做确定性检查，不猜测；每条问题都能对应一个可执行的动作。
 */

const fs = require("fs");
const net = require("net");
const path = require("path");

const DATAPACK_TYPE_DIR = (pack) => path.join(pack, "data");

function checkJava(p) {
  if (!p) return { id: "java-missing", level: "error", title: "没有指定 Java", detail: "实例设置里没有 Java 路径，服务器无法启动。", fix: "set-java" };
  if (!/[\\/]/.test(p)) return null; // PATH 里的 java，交给系统
  if (!fs.existsSync(p)) return { id: "java-path", level: "error", title: "Java 路径不存在", detail: p, fix: "set-java" };
  return null;
}

function checkJar(dir) {
  for (const name of ["fabric-server-launch.jar", "server.jar"]) {
    if (fs.existsSync(path.join(dir, name))) return null;
  }
  return { id: "jar-missing", level: "error", title: "找不到服务端 jar", detail: `在 ${dir} 下既没有 fabric-server-launch.jar 也没有 server.jar`, fix: "reinstall" };
}

function checkEula(dir) {
  const p = path.join(dir, "eula.txt");
  if (!fs.existsSync(p)) return { id: "eula-missing", level: "warn", title: "还没同意 EULA", detail: "首次启动会自动生成 eula.txt，需要改成 eula=true", fix: "accept-eula" };
  try {
    const text = fs.readFileSync(p, "utf-8");
    if (/eula\s*=\s*true/i.test(text)) return null;
    return { id: "eula-false", level: "error", title: "EULA 未接受", detail: "eula.txt 里不是 true，服务器会直接退出", fix: "accept-eula" };
  } catch (e) {
    return null;
  }
}

async function checkPort(port) {
  if (!port) return null;
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (occupied) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(
        occupied
          ? {
              id: "port-busy",
              level: "error",
              title: `端口 ${port} 已被占用`,
              detail: "可能已经有一个服务器在跑，或者别的程序占了这个端口",
              fix: "change-port",
            }
          : null
      );
    };
    socket.setTimeout(600);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, "127.0.0.1");
  });
}

/** 26.1 的 dimension_type 少了 has_ender_dragon_fight 会让整个注册表加载失败 */
function checkDatapacks(dir) {
  const root = path.join(dir, "world", "datapacks");
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return null;
  }
  const broken = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mwm-")) continue;
    const packDir = path.join(root, entry.name);
    let namespaces = [];
    try {
      namespaces = fs.readdirSync(DATAPACK_TYPE_DIR(packDir));
    } catch (e) {
      continue;
    }
    for (const ns of namespaces) {
      const typeDir = path.join(packDir, "data", ns, "dimension_type");
      if (!fs.existsSync(typeDir)) continue;
      for (const file of fs.readdirSync(typeDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const json = JSON.parse(fs.readFileSync(path.join(typeDir, file), "utf-8"));
          if (typeof json.has_ender_dragon_fight !== "boolean") broken.push(`${entry.name}/${ns}/${file}`);
        } catch (e) {
          broken.push(`${entry.name}/${ns}/${file}`);
        }
      }
    }
  }
  if (!broken.length) return null;
  return {
    id: "datapack-format",
    level: "error",
    title: `${broken.length} 个维度定义是旧格式`,
    detail: "26.1 的数据包会让服务器在「加载注册表」阶段直接失败，无法启动。",
    fix: "repair-datapacks",
    samples: broken.slice(0, 3),
  };
}

function checkMemory(maxGb) {
  if (!maxGb) return null;
  const totalGb = Math.floor(require("os").totalmem() / 1024 ** 3);
  if (maxGb > totalGb) {
    return {
      id: "memory-too-high",
      level: "warn",
      title: `最大内存 ${maxGb}G 超过物理内存`,
      detail: `本机只有约 ${totalGb}G，设这么高容易触发系统换页反而更卡`,
      fix: "lower-memory",
    };
  }
  return null;
}

function checkDisk(dir) {
  try {
    const stat = fs.statfsSync ? fs.statfsSync(dir) : null;
    if (!stat) return null;
    const freeGb = (stat.bavail * stat.bsize) / 1024 ** 3;
    if (freeGb < 2) {
      return { id: "disk-low", level: "warn", title: "磁盘剩余空间不足 2G", detail: `当前约 ${freeGb.toFixed(1)}G`, fix: null };
    }
  } catch (e) {}
  return null;
}

async function run(instance) {
  if (!instance?.dir) return { issues: [], ok: false };
  const issues = [];
  const push = (x) => x && issues.push(x);

  push(checkJava(instance.javaPath));
  push(checkJar(instance.dir));
  push(checkEula(instance.dir));
  push(checkDatapacks(instance.dir));
  push(await checkPort(instance.port));
  push(checkMemory(instance.memoryMax));
  push(checkDisk(instance.dir));

  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    checkedAt: Date.now(),
  };
}

module.exports = { run, checkDatapacks, checkPort, checkEula };
