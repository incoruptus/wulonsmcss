/**
 * Minecraft 版本比较 + 自定义维度能力判断。
 *
 * 注意两层限制：
 * 1. 原版 Minecraft 从 1.16.2 起才支持数据包自定义维度；
 * 2. 当前 MWM 生成器只写 26.1 schema（pack_format 101），更早的版本即使原版支持维度，
 *    也不能直接套这个包。
 */

import { tGlobal } from "../i18n/core";

export type DimensionSupport = "unsupported" | "legacy" | "supported" | "unknown";

function parse(value: string): number[] | null {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(value ?? "").trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

export function compareMcVersion(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function dimensionSupport(mcVersion: string): DimensionSupport {
  if (!parse(mcVersion)) return "unknown";
  if (compareMcVersion(mcVersion, "1.16.2") < 0) return "unsupported";
  if (compareMcVersion(mcVersion, "26.1") < 0) return "legacy";
  return "supported";
}

export function dimensionSupportMessage(mcVersion: string): string {
  const kind = dimensionSupport(mcVersion);
  if (kind === "unsupported") {
    return tGlobal(
      "mcVersion.dimension.unsupported",
      "{mc} 的原版不支持数据包自定义维度（需要 1.16.2+），当前只能使用 mod 或插件实现。",
      { mc: mcVersion },
    );
  }
  if (kind === "legacy") {
    return tGlobal(
      "mcVersion.dimension.legacy",
      "{mc} 的原版支持自定义维度，但当前 MWM 生成器只输出 26.1 数据包格式，直接生成会导致服务器无法加载。",
      { mc: mcVersion },
    );
  }
  if (kind === "unknown") {
    return tGlobal("mcVersion.dimension.unknown", "无法识别这个服务器的 Minecraft 版本，已禁用多世界生成，避免写入不兼容的数据包。");
  }
  return "";
}
