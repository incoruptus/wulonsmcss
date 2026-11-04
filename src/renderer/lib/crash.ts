/**
 * 崩溃翻译官
 * ------------------------------------------------------------
 * 目标：把「一屏 Java 红字」翻译成「哪个 Mod / 什么问题 / 怎么修」。
 * 只做高置信度的模式匹配，宁可少报也不要瞎报；匹配不到就老实说不知道。
 */

import { tGlobal } from "../i18n/core";

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
        title: tGlobal("crash.java.title", "Java 版本太旧"),
        detail: ver
          ? tGlobal("crash.java.detailVer", "该服务端需要更高版本的 Java（提示版本 {ver}），当前 Java 版本过低。", { ver })
          : tGlobal("crash.java.detail", "服务端使用了当前 Java 版本不支持的 class 版本。"),
        actions: [{ label: tGlobal("crash.java.action", "换一个 Java"), kind: "change-java" }],
      };
    },
  },
  {
    id: "port-busy",
    test: /Address already in use|FAILED TO BIND TO PORT|Perhaps a server is already running/i,
    build: () => ({
      id: "port-busy",
      severity: "error",
      title: tGlobal("crash.port.title", "端口被占用"),
      detail: tGlobal("crash.port.detail", "25565 端口已被其它程序占用，可能还有另一个服务器实例在运行。"),
      actions: [{ label: tGlobal("crash.port.action", "换端口"), kind: "free-port" }],
    }),
  },
  {
    id: "oom",
    test: /java\.lang\.OutOfMemoryError|GC overhead limit exceeded|Java heap space/i,
    build: () => ({
      id: "oom",
      severity: "error",
      title: tGlobal("crash.oom.title", "内存不够"),
      detail: tGlobal("crash.oom.detail", "JVM 堆内存溢出。安装大型模组的服务器建议调高最大内存，并确认物理内存充足。"),
      actions: [{ label: tGlobal("crash.oom.action", "调大内存"), kind: "raise-memory" }],
    }),
  },
  {
    id: "registry",
    test: /Failed to load registries|Failed to parse .* from pack|No key has_ender_dragon_fight/i,
    build: (text) => ({
      id: "registry",
      severity: "error",
      title: tGlobal("crash.registry.title", "数据包格式不对"),
      detail: tGlobal("crash.registry.detail", "自定义维度或数据包解析失败，服务器在加载注册表阶段退出，该版本数据包格式已变更。"),
      actions: [{ label: tGlobal("crash.registry.action", "修复数据包"), kind: "repair-datapacks" }],
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
        title: tGlobal("crash.dep.title", "Mod 依赖不满足"),
        detail: mods.length
          ? tGlobal("crash.dep.detailMods", "以下模组缺少前置依赖或版本不匹配：{mods}", { mods: mods.join("、") })
          : tGlobal("crash.dep.detail", "某个模组缺少前置依赖，或两个模组要求的版本相互冲突。"),
        actions: mods.length
          ? [{ label: tGlobal("crash.dep.actionTry", "禁用 {mod} 试试", { mod: mods[0] }), kind: "disable-mod", arg: mods[0] }]
          : [],
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
        title: mods.length
          ? tGlobal("crash.modCrash.titleMod", "疑似 {mod} 导致崩溃", { mod: mods[0] })
          : tGlobal("crash.modCrash.title", "有 Mod 抛异常"),
        detail: mods.length
          ? tGlobal("crash.modCrash.detailMods", "堆栈中出现 {mods}，可先禁用这些模组再启动，逐个排查。", { mods: mods.join("、") })
          : tGlobal("crash.modCrash.detail", "异常堆栈指向某个模组，但无法确定具体是哪一个。"),
        actions: mods.length
          ? [{ label: tGlobal("crash.modCrash.actionDisable", "禁用 {mod}", { mod: mods[0] }), kind: "disable-mod", arg: mods[0] }]
          : [],
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
      title: tGlobal("crash.session.title", "存档被占用"),
      detail: tGlobal("crash.session.detail", "world 目录被其它进程占用，通常是因为同一个服务器启动了两份。"),
      actions: [{ label: tGlobal("crash.session.action", "检查进程"), kind: "none" }],
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
      title: tGlobal("crash.unknown.title", "启动失败，未能识别具体原因"),
      detail: tGlobal("crash.unknown.detail", "日志中存在异常记录，可先查看控制台最后 30 行，或导出日志后搜索第一个 Exception。"),
      actions: [{ label: tGlobal("crash.unknown.action", "打开控制台"), kind: "none" }],
    };
  }
  return null;
}
