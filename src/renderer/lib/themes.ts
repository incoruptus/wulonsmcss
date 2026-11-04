/**
 * 茶色主题清单
 * ------------------------------------------------------------
 * 五种茶 = 五套「品牌色 + 中性茶底」，不是换一张皮：
 *   - 语义颜色（成功/警告/危险）不跟着茶色走，避免红色主题把「危险」吃掉；
 *   - 品牌色负责当前位置、主操作、焦点和进度；
 *   - 中性色负责背景与正文，白茶是纯黑白，其余四种带一点茶底。
 *
 * 真正的颜色写在 globals.css 的 [data-palette] 块里；这里只放选择器需要的
 * 名字、描述和色卡，避免 UI 里散落一串 hex。
 *
 * tea / name / note 用 getter 取词：模块加载时不取语言，渲染时访问属性才
 * 按当前语言翻译；切换语言后重新渲染即可生效。
 */

import type { PaletteId } from "./types";
import { tGlobal } from "../i18n/core";

export interface PaletteMeta {
  id: PaletteId;
  /** 茶类 */
  tea: string;
  /** 具体茶名 */
  name: string;
  /** 一句话说明它适合什么心情 */
  note: string;
  /** 色卡：品牌色 / 浅底 / 页面底色 */
  swatch: {
    light: [string, string, string];
    dark: [string, string, string];
  };
}

export const PALETTES: PaletteMeta[] = [
  {
    id: "green",
    get tea() {
      return tGlobal("theme.green.tea", "绿茶");
    },
    get name() {
      return tGlobal("theme.green.name", "西湖龙井");
    },
    get note() {
      return tGlobal("theme.green.note", "清爽稳重，默认茶色");
    },
    swatch: {
      light: ["#527736", "#dfedd5", "#f5f7f3"],
      dark: ["#aed58f", "#233522", "#0c100d"],
    },
  },
  {
    id: "white",
    get tea() {
      return tGlobal("theme.white.tea", "白茶");
    },
    get name() {
      return tGlobal("theme.white.name", "白毫银针");
    },
    get note() {
      return tGlobal("theme.white.note", "黑白配色，按钮同样呈现黑白质感");
    },
    swatch: {
      light: ["#171717", "#e5e5e5", "#f4f4f4"],
      dark: ["#f2f2f2", "#242424", "#0b0b0b"],
    },
  },
  {
    id: "red",
    get tea() {
      return tGlobal("theme.red.tea", "红茶");
    },
    get name() {
      return tGlobal("theme.red.name", "祁门工夫");
    },
    get note() {
      return tGlobal("theme.red.note", "酒红色调，温暖克制");
    },
    swatch: {
      light: ["#9c2f42", "#f2d3d9", "#faf4f2"],
      dark: ["#df7788", "#361a20", "#0c0909"],
    },
  },
  {
    id: "yellow",
    get tea() {
      return tGlobal("theme.yellow.tea", "黄茶");
    },
    get name() {
      return tGlobal("theme.yellow.name", "君山银针");
    },
    get note() {
      return tGlobal("theme.yellow.note", "麦芽金色，柔和而不失力度");
    },
    swatch: {
      light: ["#8a5f12", "#f6e6bb", "#faf5e7"],
      dark: ["#e2b85a", "#362c16", "#0c0a07"],
    },
  },
  {
    id: "puer",
    get tea() {
      return tGlobal("theme.puer.tea", "黑茶");
    },
    get name() {
      return tGlobal("theme.puer.name", "云南普洱");
    },
    get note() {
      return tGlobal("theme.puer.note", "褐色基调，沉稳如陈茶");
    },
    swatch: {
      light: ["#7a5230", "#e9d8c6", "#f7f1e9"],
      dark: ["#c39a70", "#30231a", "#0c0a08"],
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = "white";

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}

export function paletteOf(value: unknown): PaletteMeta {
  return PALETTES.find((p) => p.id === value) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE) ?? PALETTES[0];
}
