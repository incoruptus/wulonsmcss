import raw from "@/assets/zh-names.json";

/**
 * Mod 中文名对照表
 * ------------------------------------------------------------
 * 来源：MC 百科（mcmod.cn）条目，经 PCL 整理成 WikiEntries.txt；
 * 这里只取「Modrinth slug → 中文名」一列（scripts/build-zh-names.cjs 生成）。
 * 没有收录的项目**不编造**中文名，界面显示英文原标题。
 */
const ZH = raw as Record<string, string>;

export const ZH_NAME_COUNT = Object.keys(ZH).length;

export function zhNameOf(slug?: string | null): string | null {
  if (!slug) return null;
  return ZH[slug] ?? null;
}

export function isCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

/**
 * 中文关键词 → Modrinth slug。
 * 例：「机械动力」→ create；「钠」→ sodium（精确名优先，其次前缀、包含）。
 */
export function zhSearchSlugs(query: string, limit = 8): string[] {
  const q = query.trim();
  if (q.length < 1 || !isCjk(q)) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const [slug, name] of Object.entries(ZH)) {
    if (name === q) exact.push(slug);
    else if (name.startsWith(q)) prefix.push(slug);
    else if (name.includes(q)) contains.push(slug);
    if (exact.length >= limit) break;
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

/** 给测试与调试用：完整表（只读） */
export function allZhNames(): Readonly<Record<string, string>> {
  return ZH;
}
