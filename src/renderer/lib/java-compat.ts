import type { JavaInfo } from "./types";

/**
 * Minecraft Java 版对 Java 运行时的最低要求。
 * 来源：Minecraft Wiki 各版本页（26.1 起要求 Java 25；1.20.5 起 21；1.18 起 17）。
 * 只用于「帮用户挑一个能跑的 Java」，不是启动器级的精确匹配。
 */
export function javaMajorFor(mcVersion: string): number {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(mcVersion || "").trim());
  if (!m) return 21;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3] || 0);
  if (major >= 26) return 25;
  if (major === 1) {
    if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
    if (minor >= 18) return 17;
    if (minor === 17) return 16;
    return 8;
  }
  return 21;
}

/**
 * 从检测到的 Java 里挑一个：
 * 1) 优先完全等于要求的版本（1.20.1 → Java 17，而不是 25）
 * 2) 没有就用比要求高的最低版本（Java 21 跑 1.20.4 通常可以）
 * 3) 都低于要求则返回 null（调用方要提示用户装 Java）
 */
export function pickJavaFor(javas: JavaInfo[], required: number): JavaInfo | null {
  const list = [...javas].filter((j) => Number(j.major) > 0).sort((a, b) => Number(a.major) - Number(b.major));
  const exact = list.find((j) => Number(j.major) === required);
  if (exact) return exact;
  return list.find((j) => Number(j.major) > required) ?? null;
}

/** 给用户看的说明，避免只显示一个数字 */
export function javaRequirementText(mcVersion: string): string {
  const need = javaMajorFor(mcVersion);
  return `Minecraft ${mcVersion} 需要 Java ${need} 或更高版本`;
}
