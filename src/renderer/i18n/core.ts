/**
 * 轻量 i18n 内核：不依赖第三方库，先提供 Locale / 词典 / 插值 / 回退。
 *
 * 页面迁移时用语义 key，例如：
 *   t("nav.overview", "总览")
 * 英文词典没有该 key 时回退中文，再回退 fallback；这样文案可以分批迁，不会出现空白。
 */

export const DEFAULT_LOCALE = "zh-CN" as const;

export const LOCALES = [
  { id: "zh-CN", label: "中文" },
  { id: "en-US", label: "English" },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

export type MessageVars = Record<string, string | number | boolean | null | undefined>;

export type Messages = Record<string, string>;

/** 词典先留空；按页面迁移时往这里加。 */
export const catalogs: Record<Locale, Messages> = {
  "zh-CN": {},
  "en-US": {},
};

export function isLocale(value: unknown): value is Locale {
  return value === "zh-CN" || value === "en-US";
}

export function addMessages(locale: Locale, messages: Messages): void {
  Object.assign(catalogs[locale], messages);
}

function interpolate(template: string, vars: MessageVars): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * 取词顺序：当前语言 → 中文 → 调用处 fallback。
 * 这样未翻译的页面不会空白，也不会把 key 直接暴露给用户。
 */
export function translate(locale: Locale, key: string, fallback: string, vars: MessageVars = {}): string {
  const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? fallback;
  return interpolate(template, vars);
}
