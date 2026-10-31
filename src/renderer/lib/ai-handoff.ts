/**
 * AI 排错交接
 * ------------------------------------------------------------
 * 把「现场」整理成一段提示词：实例信息 + 症状 + 最近日志 + 知识库位置。
 * 先脱敏（令牌/密钥），再由用户粘给任意 AI。
 */

import type { Instance } from "./types";

export interface HandoffInput {
  instance: Instance;
  symptom?: { title: string; detail: string } | null;
  logs: string[];
  docsPath?: string;
}

/** 去掉令牌、密钥一类的敏感串 */
export function redact(text: string): string {
  return text
    .replace(/(gh[pousr]_[A-Za-z0-9]{10,})/g, "gh***REDACTED")
    .replace(/(github_pat_[A-Za-z0-9_]{10,})/g, "github_pat_***REDACTED")
    .replace(/(x-mcss-token["'\s:=]+)([A-Za-z0-9]{8,})/gi, "$1***REDACTED")
    .replace(/(token["'\s:=]+)([A-Za-z0-9]{16,})/gi, "$1***REDACTED")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***REDACTED");
}

export function buildAiPrompt(input: HandoffInput): string {
  const { instance, symptom, logs, docsPath } = input;
  const tail = logs.slice(-80).map((l) => l.slice(0, 400));
  const lines: string[] = [];

  lines.push("我是 Wulon's MCSS 的用户，Minecraft 服务器有问题，请你帮我定位并给出可逆的修复步骤。");
  lines.push("");
  lines.push("【软件】Wulon's MCSS v27 —— 本地 Minecraft 服务器管理器（Electron；也可由静态网页 + 本地 agent 驱动）。");
  lines.push("【实例信息】");
  lines.push(`- 名称：${instance.name}`);
  lines.push(`- 版本：Minecraft ${instance.mcVersion} · ${instance.loader}${instance.loaderVersion ? ` ${instance.loaderVersion}` : ""}`);
  lines.push(`- 目录：${instance.dir}`);
  lines.push(`- Java：${instance.javaPath || "（未指定）"}`);
  lines.push(`- 端口：${instance.port} · 内存上限：${instance.memoryMax} GB`);
  if (symptom) {
    lines.push("");
    lines.push(`【故障现象】${symptom.title}`);
    lines.push(`【排查观察】${symptom.detail}`);
  }
  lines.push("");
  lines.push(`【最近日志（${tail.length} 行，已脱敏）】`);
  lines.push("```");
  lines.push(redact(tail.join("\n")) || "(没有日志)");
  lines.push("```");
  lines.push("");
  lines.push("【知识库】docs/ai/knowledge.md —— 症状→原因→修法的对照表与排错纪律。");
  if (docsPath) lines.push(`本机路径：${docsPath}`);
  lines.push("");
  lines.push("【要求】");
  lines.push("1. 先用一句话给结论，再给不超过 3 个可执行步骤；");
  lines.push("2. 动作必须可逆（改名/备份，不要删存档、不要让我重装系统）；");
  lines.push("3. 证据不足时说明还需要哪段日志，不要猜。");

  return lines.join("\n");
}
