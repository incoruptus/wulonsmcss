/**
 * 崩溃翻译官
 * ------------------------------------------------------------
 * 目标：把「一屏 Java 红字」翻译成「哪个 Mod / 什么问题 / 怎么修」。
 * 只做高置信度的模式匹配，宁可少报也不要瞎报；匹配不到就老实说不知道。
 */

export interface Diagnosis {
  /** 稳定 id，便于埋点与测试 */
  id: string;
  title: string;
  detail: string;
  /** 建议动作 */
  actions: { label: string; kind: "disable-mod" | "open-config" | "change-java" | "repair-datapacks" | "free-port" | "raise-memory" | "none"; arg?: string }[];
  /** 涉及到的 Mod（能识别出来时） */
  mods?: string[];
  severity: "error" | "warn";
}

interface Rule {
  id: string;
  test: RegExp;
  build: (text: string, match: RegExpMatchArray) => Diagnosis;
}

const RULES: Rule[] = [
  {
    id: "java-version",
    test: /java\.lang\.UnsupportedClassVersionError|compiled by a more recent version|requires Java (\d+)|class file version (\d+)/i,
    build: (text, m) => {
      const ver = m[1] || "";
      return {
        id: "java-version",
        severity: "error",
        title: "Java 版本太旧",
        detail: ver ? `这个服务端需要更新的 Java（提到版本 ${ver}），当前运行的 Java 不够新。` : "服务端用到了当前 Java 不支持的 class 版本。",
        actions: [{ label: "换一个 Java", kind: "change-java" }],
      };
    },
  },
  {
    id: "port-busy",
    test: /Address already in use|FAILED TO BIND TO PORT|Perhaps a server is already running/i,
    build: () => ({
      id: "port-busy",
      severity: "error",
      title: "端口被占用",
      detail: "25565 已经被别的程序占了——可能还开着另一个服务器实例。",
      actions: [{ label: "换端口", kind: "free-port" }],
    }),
  },
  {
    id: "oom",
    test: /java\.lang\.OutOfMemoryError|GC overhead limit exceeded|Java heap space/i,
    build: () => ({
      id: "oom",
      severity: "error",
      title: "内存不够",
      detail: "JVM 堆溢出了。装了大型 Mod 的服建议把最大内存调高（同时确认物理内存够）。",
      actions: [{ label: "调大内存", kind: "raise-memory" }],
    }),
  },
  {
    id: "registry",
    test: /Failed to load registries|Failed to parse .* from pack|No key has_ender_dragon_fight/i,
    build: (text) => ({
      id: "registry",
      severity: "error",
      title: "数据包格式不对",
      detail: "自定义维度/数据包解析失败，服务器在加载注册表阶段就退出了（26.1 的格式变过）。",
      actions: [{ label: "修复数据包", kind: "repair-datapacks" }],
    }),
  },
  {
    id: "missing-dep",
    test: /Missing or unsupported mandatory dependencies|requires .* which is missing|Incompatible mod set/i,
    build: (text) => {
      const mods = collectMods(text);
      return {
        id: "missing-dep",
        severity: "error",
        title: "Mod 依赖不满足",
        detail: mods.length ? `这些 Mod 缺少前置或版本不匹配：${mods.join("、")}` : "有 Mod 缺少前置，或两个 Mod 要求的版本互相冲突。",
        actions: mods.length ? [{ label: `禁用 ${mods[0]} 试试`, kind: "disable-mod", arg: mods[0] }] : [],
        mods,
      };
    },
  },
  {
    id: "mod-crash",
    test: /A mod crashed|Caused by: .*Exception.*\bmod\b|from mod ([a-z0-9_-]+)/i,
    build: (text) => {
      const mods = collectMods(text);
      return {
        id: "mod-crash",
        severity: "error",
        title: mods.length ? `疑似 ${mods[0]} 导致崩溃` : "有 Mod 抛异常",
        detail: mods.length
          ? `堆栈里出现了 ${mods.join("、")}，可以先禁用它们再启动，逐个排查。`
          : "堆栈指向某个 Mod，但没能识别出具体是哪一个。",
        actions: mods.length ? [{ label: `禁用 ${mods[0]}`, kind: "disable-mod", arg: mods[0] }] : [],
        mods,
      };
    },
  },
  {
    id: "session-lock",
    test: /session\.lock|already running on this world|world is already in use/i,
    build: () => ({
      id: "session-lock",
      severity: "error",
      title: "存档被占用",
      detail: "world 目录被另一个进程锁着——通常是同一个服务器开了两份。",
      actions: [{ label: "检查进程", kind: "none" }],
    }),
  },
];

/** 从日志里挖 mod id：`from mod sodium` / `(sodium.mixins.json)` / `mod:sodium` */
export function collectMods(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/from mod ([a-z0-9_-]{2,64})/gi)) found.add(m[1]);
  for (const m of text.matchAll(/\b([a-z0-9_-]{2,64})\.mixins\.json/gi)) found.add(m[1]);
  for (const m of text.matchAll(/\bmod[: ]([a-z0-9_-]{2,64})\b/gi)) found.add(m[1]);
  // 过滤常见噪声
  const noise = new Set(["minecraft", "java", "fabric", "loader", "main", "server", "mod"]);
  return [...found].filter((x) => !noise.has(x.toLowerCase())).slice(0, 5);
}

/** 输入最近若干行日志，输出一条（或零条）诊断 */
export function diagnose(lines: string[]): Diagnosis | null {
  const text = lines.join("\n");
  if (!text.trim()) return null;
  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (m) return rule.build(text, m as RegExpMatchArray);
  }
  // 兜底：有 ERROR 但没匹配到模式
  if (/\bERROR\b|Exception in thread|Caused by:/.test(text)) {
    return {
      id: "unknown",
      severity: "warn",
      title: "启动失败，但没认出原因",
      detail: "日志里有异常，可以先看控制台最后 30 行，或把日志导出后搜索第一个 Exception。",
      actions: [{ label: "打开控制台", kind: "none" }],
    };
  }
  return null;
}
