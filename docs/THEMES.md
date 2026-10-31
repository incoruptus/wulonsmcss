# 茶色主题系统（2026-10-31）

> 目标：五种茶不是五套皮肤，而是一套**可扩展的配色管线**。
> 加第六种茶时，只写一份色卡 + 一个 `data-palette` 块，组件不需要改。

## 1. 两层模型

```
明暗  theme    light | dark | system     → <html class="dark">
茶色  palette  green | white | red | yellow | puer → <html data-palette="...">
```

两者正交：同一套茶色在浅色/深色下各有一套色值；切换茶色不会改变明暗，切换明暗也不会改变茶色。

## 2. 五种茶

| id | 茶类 | 茶名 | 品牌色 | 中性茶底 |
|---|---|---|---|---|
| `green` | 绿茶 | 西湖龙井 | 茶绿 | 带一点绿意的暖灰（默认） |
| `white` | 白茶 | 白毫银针 | 蓝 | 纯黑白灰，回到原来的黑白 + 蓝/红强调 |
| `red` | 红茶 | 祁门工夫 | 石榴红 | 极浅的暖红灰 |
| `yellow` | 黄茶 | 君山银针 | 麦芽金 | 奶油黄灰 |
| `puer` | 黑茶 | 云南普洱 | 褐色 | 米褐灰 |

- 白茶不是“没有颜色”，而是中性色回到纯灰，品牌色回到原来的蓝；成功/警告/危险仍用绿/黄/红。
- 红茶用偏石榴的红，和 `danger` 的橙红拉开距离；避免“停止服务器”和“启动服务器”长得一样。
- 黑茶是褐，不是红；和红茶刻意分开。

## 3. Token 分层

`src/renderer/styles/globals.css` 里只有两类 token：

| 层 | 例子 | 谁用 |
|---|---|---|
| 语义中性 | `--ds-background-100/200`、`--ds-gray-100…1000` | 页面、卡片、正文、边框 |
| 品牌 | `--ds-brand-100…700`、`--ds-brand-ink`、`--ds-focus-color` | 主操作、当前位置、焦点、进度、品牌标记 |
| 语义状态 | `--ds-red/amber/green/blue-*` | 错误、警告、成功、信息；**不随茶色变化** |

组件只允许用 Tailwind 映射后的类名（`bg-brand-600`、`text-gray-800`），不写 hex，也不判断当前是哪套茶。

`@theme inline` 把 `--ds-*` 映射成 `--color-*`，所以：

```tsx
<Button variant="accent" />   // bg-brand-600 text-brand-ink
<span className="text-brand-700" />
```

## 4. 选择器与优先级

```css
:root { /* 默认绿茶（浅色） */ }
.dark { /* 默认绿茶（深色） */ }

:root:not(.dark)[data-palette="white"] { /* 白茶浅色 */ }
:root.dark[data-palette="white"] { /* 白茶深色 */ }
```

- 浅色块用 `:not(.dark)` 排除深色，避免浅色值漏进深色模式。
- 深色块用 `:root.dark[data-palette=…]`，特异性高于 `.dark`，稳定覆盖默认绿茶。
- `applyAppearance()` 只负责切 `class` 和 `data-palette`，不做颜色判断。

## 5. 对比度

主操作按钮的文字对比度按 WCAG AA（普通文本 4.5:1）反推：

| 茶 | 浅色主按钮 | 对比度 |
|---|---|---|
| 绿茶 | `#527736` + `#f4faee` | ≈ 5.0 |
| 白茶 | `#1673e8` + `#ffffff` | ≈ 4.5 |
| 红茶 | `#9c2f42` + `#fff8f9` | ≈ 7.2 |
| 黄茶 | `#8a5f12` + `#fffdf2` | ≈ 5.8 |
| 黑茶 | `#7a5230` + `#fff8f1` | ≈ 6.9 |

深色模式统一用浅品牌色 + 深墨色文字，对比度都在 9:1 以上。

状态色不跟茶色走，因此“红茶主题里的危险按钮仍然是危险红”，不会因为品牌色是红而失去语义。

## 6. 新增一种茶

1. 在 `src/renderer/lib/types.ts` 的 `PaletteId` 加 id。
2. 在 `src/renderer/lib/themes.ts` 的 `PALETTES` 加名称、说明、浅/深各三格色卡。
3. 在 `globals.css` 加两组块：`:root:not(.dark)[data-palette=…]` 与 `:root.dark[data-palette=…]`，至少覆盖：
   - `--ds-background-100/200`
   - `--ds-gray-100…1000`
   - `--ds-brand-100/200/300/500/600/700`、`--ds-brand-ink`
   - `--ds-focus-color`、`--ds-panel-highlight`
4. 跑 `pnpm test`，`themes.test.ts` 会检查 id 唯一、色卡格式。
5. 用「设置 → 茶色」切过去，截图检查浅色/深色两套。

## 7. 文件

- `src/renderer/lib/themes.ts`：茶色清单与色卡
- `src/renderer/lib/types.ts`：`PaletteId`、`AppConfig.palette`
- `src/renderer/lib/config-model.ts`：迁移与默认值
- `src/renderer/stores/config.ts`：`applyAppearance` 切 `data-palette`
- `src/renderer/pages/Settings.tsx`：茶色选择器
- `src/renderer/styles/globals.css`：五套 token
