import { addMessages } from "../core";

/**
 * 英文词典：语义 key → 英文。
 *
 * 中文不单独建词典：每个调用处已经带中文 fallback，translate 会按
 * 「当前语言 → 中文词典 → 调用处 fallback」兜底，未翻译的条目直接显示中文。
 * 按页面分组，新增页面时在下面追加一段即可。
 */
export const en: Record<string, string> = {
  // 设置
  "settings.title": "Settings",
  "settings.desc":
    "Shape Wulon's MCSS to fit your habits. Appearance settings never touch server files or worlds.",
  "settings.mode.title": "How you use it",
  "settings.mode.desc":
    "Hosts and players get different home screens and navigation; the data is the same.",
  "settings.palette.title": "Tea palette",
  "settings.palette.desc":
    "The five tea palettes only change the mood. Success, warning and danger keep their own green, amber and red.",
  "settings.runtime.title": "Runtime and feedback",
  "settings.runtime.desc": "Control log retention and interface motion.",
  "settings.about.title": "About Wulon's MCSS",
  "settings.appearance.label": "Light and dark",
  "settings.appearance.hint":
    "Each tea palette recalculates contrast for light and dark mode.",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.system": "Follow system",
  "settings.language.label": "Language",
  "settings.language.hint":
    "The interface updates immediately. Servers, mods and worlds are untouched.",
};

addMessages("en-US", en);
