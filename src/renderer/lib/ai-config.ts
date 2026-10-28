/**
 * AI 配置助手（纯逻辑）
 * ------------------------------------------------------------
 * 我们没有、也不该有 AI 的 key，所以这里做的是「交接」而不是「调用」：
 *   用户描述需求 → 复制一段带 schema 的提示词 → 粘给任意 AI → 把 JSON 贴回来 → 校验 → 应用。
 *
 * 关键是**校验**：AI 给的东西一律当不可信输入，只接受白名单里的键、类型对得上的值。
 */

export interface ConfigChange {
  key: string;
  from: string;
  to: string;
  level: "ok" | "warn";
  note?: string;
}

export interface ParseResult {
  changes: ConfigChange[];
  rejected: { key: string; reason: string }[];
  notes: string;
  error?: string;
}

/** 值域明确的键 */
const ENUMS: Record<string, string[]> = {
  difficulty: ["peaceful", "easy", "normal", "hard"],
  gamemode: ["survival", "creative", "adventure", "spectator"],
  "level-type": ["minecraft:normal", "minecraft:flat", "minecraft:large_biomes", "minecraft:amplified", "minecraft:single_biome_surface"],
  "difficulty-old": [],
};

/** 改了容易出事、需要额外提醒的键 */
const SENSITIVE = new Set(["server-port", "online-mode", "level-name", "level-seed", "enable-command-block", "white-list", "enforce-whitelist"]);

const isBool = (v: string) => v === "true" || v === "false";
const isNumber = (v: string) => v.trim() !== "" && Number.isFinite(Number(v));

function keysOf(props: Record<string, string>): string[] {
  return Object.keys(props).sort();
}

/** 给 AI 的提示词：把当前配置、允许改的键、输出格式都写死 */
export function buildConfigPrompt(
  context: { mc: string; loader: string; players?: number },
  props: Record<string, string>,
  wish: string,
): string {
  const keys = keysOf(props);
  const sample = keys.slice(0, 40).map((k) => `  "${k}": "${props[k]}"`).join(",\n");

  return [
    "你在帮我配置一个 Minecraft 服务器。请只输出 JSON，不要解释、不要代码块以外的文字。",
    "",
    `【服务器】Minecraft ${context.mc} · ${context.loader}${context.players ? ` · 预计 ${context.players} 人` : ""}`,
    `【我的需求】${wish || "（未填写）"}`,
    "",
    "【当前 server.properties（节选）】",
    "{",
    sample,
    "}",
    "",
    "【允许修改的键】只接受下面这些键，其它一律忽略：",
    keys.join(", "),
    "",
    "【输出格式】",
    '{ "changes": { "键": "新值" }, "notes": "一句话说明你改了什么" }',
    "",
    "【规则】",
    "- 值必须是字符串、数字或 true/false；布尔值写成 \"true\"/\"false\"。",
    "- 只写需要改的键；不要改 server-port / online-mode / level-name，除非我明确要求。",
    "- 不要输出注释或多余字段。",
  ].join("\n");
}

/** 从 AI 回复里抠出 JSON（容忍 ```json 包裹、前后废话） */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("回复里没有找到 JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * 校验 AI 给的改动。
 * 只接受 props 里已有的键；类型对不上就拒绝（不静默改类型）。
 */
export function parseConfigReply(reply: string, props: Record<string, string>): ParseResult {
  let data: unknown;
  try {
    data = extractJson(reply);
  } catch (e) {
    return { changes: [], rejected: [], notes: "", error: (e as Error).message };
  }

  const obj = (data ?? {}) as { changes?: unknown; notes?: unknown };
  const rawChanges = obj.changes;
  if (!rawChanges || typeof rawChanges !== "object") {
    return { changes: [], rejected: [], notes: "", error: "回复里缺少 changes 字段" };
  }

  const changes: ConfigChange[] = [];
  const rejected: { key: string; reason: string }[] = [];

  for (const [key, rawValue] of Object.entries(rawChanges as Record<string, unknown>)) {
    if (!(key in props)) {
      rejected.push({ key, reason: "不是 server.properties 里的键" });
      continue;
    }
    if (rawValue === null || rawValue === undefined || typeof rawValue === "object") {
      rejected.push({ key, reason: "值必须是字符串、数字或布尔" });
      continue;
    }

    const value = String(rawValue).trim();
    if (typeof rawValue === "boolean" || isBool(value)) {
      if (!isBool(value)) {
        rejected.push({ key, reason: "布尔键只接受 true/false" });
        continue;
      }
    }
    if (isNumber(props[key]) && !isNumber(value)) {
      rejected.push({ key, reason: `这个键是数字（当前 ${props[key]}）` });
      continue;
    }
    const allowed = ENUMS[key];
    if (allowed && allowed.length && !allowed.includes(value)) {
      rejected.push({ key, reason: `只接受：${allowed.join(" / ")}` });
      continue;
    }

    const from = props[key];
    if (from === value) continue;

    changes.push({
      key,
      from,
      to: value,
      level: SENSITIVE.has(key) ? "warn" : "ok",
      note: SENSITIVE.has(key) ? "改动会影响连接方式，确认后再应用" : undefined,
    });
  }

  return { changes, rejected, notes: typeof obj.notes === "string" ? obj.notes : "" };
}

/** 应用改动（返回新的 props，不改原对象） */
export function applyChanges(props: Record<string, string>, changes: ConfigChange[]): Record<string, string> {
  const next = { ...props };
  for (const change of changes) next[change.key] = change.to;
  return next;
}
