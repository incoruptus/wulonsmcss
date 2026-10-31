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
 */

import type { PaletteId } from "./types";

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
    tea: "绿茶",
    name: "西湖龙井",
    note: "清、稳，默认的茶室",
    swatch: {
      light: ["#527736", "#dfedd5", "#f5f7f3"],
      dark: ["#aed58f", "#233522", "#0c100d"],
    },
  },
  {
    id: "white",
    tea: "白茶",
    name: "白毫银针",
    note: "黑白底，蓝作强调",
    swatch: {
      light: ["#1673e8", "#e2efff", "#f4f4f4"],
      dark: ["#64b4f5", "#132b40", "#0b0b0b"],
    },
  },
  {
    id: "red",
    tea: "红茶",
    name: "祁门工夫",
    note: "酒红，暖而不闹",
    swatch: {
      light: ["#9c2f42", "#f2d3d9", "#faf4f2"],
      dark: ["#df7788", "#361a20", "#0c0909"],
    },
  },
  {
    id: "yellow",
    tea: "黄茶",
    name: "君山银针",
    note: "麦芽金，柔和但不弱",
    swatch: {
      light: ["#8a5f12", "#f6e6bb", "#faf5e7"],
      dark: ["#e2b85a", "#362c16", "#0c0a07"],
    },
  },
  {
    id: "puer",
    tea: "黑茶",
    name: "云南普洱",
    note: "褐色，沉一点的老茶",
    swatch: {
      light: ["#7a5230", "#e9d8c6", "#f7f1e9"],
      dark: ["#c39a70", "#30231a", "#0c0a08"],
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = "green";

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}

export function paletteOf(value: unknown): PaletteMeta {
  return PALETTES.find((p) => p.id === value) ?? PALETTES[0];
}
