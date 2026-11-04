import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, isLocale, setActiveLocale, translate, type Locale, type MessageVars } from "./core";
// 副作用导入：把已翻译的条目注册进 catalogs
import "./messages";

const STORAGE_KEY = "mcss.locale";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback: string, vars?: MessageVars) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // 隐私模式 / 初始化早期拿不到 localStorage，退回默认
  }
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  // 渲染期同步给非组件代码用的全局语言，保证同一次渲染里 t 与 tGlobal 一致
  setActiveLocale(locale);

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下也不阻断切换
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, fallback: string, vars?: MessageVars) => translate(locale, key, fallback, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return value;
}

export { LOCALES, DEFAULT_LOCALE, type Locale, type MessageVars } from "./core";
