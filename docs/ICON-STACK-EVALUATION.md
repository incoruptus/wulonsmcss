# 图标栈评估：Lucide → Aviala（2026-10-31）

> 结论先说：**现在没有“换一套图标库”这种一键操作可做。**
> Aviala 是一套设计语言级的图标系统（粗细 / 填充 / 字号令牌都对），但不是通用 UI 图标库：
> 我们实际用了 94 个图标，约 65 个能直接或近义映射，17 个需要确认命名，10 个左右确实没有。
> 建议走「语义适配层 + Aviala 主力 + 缺失图标 fallback」，不要大爆炸替换。

## 1. 先澄清版权

- 当前代码依赖的是 **`lucide-react@0.470.0`（ISC 许可）**，不是 Geist Icons。
- 仓库里没有 Geist 的图标文件；只有 `shadow-geist-*` 这种设计令牌类名。
- 所以“Geist Icons 不开源”不构成当前仓库的版权风险。换 Aviala 的理由应该是**视觉语言统一 / 粗细与填充能力**，不是避险。
- `@aviala-design/icons@2.6.0` 与 `@aviala-design/spiral@3.1.1` 都是 **MIT**；图标包 21.5 MB（解包），React ≥18，ESM/CJS + 类型齐全。

## 2. 现状：94 个图标、44 个文件

`node scripts/icon-audit.cjs` 的统计：

| 指标 | 数值 |
|---|---:|
| 导入 `lucide-react` 的文件 | 44 |
| 唯一图标 | 94 |
| 使用最多的 | `RefreshCw` 17、`FolderOpen` 14、`Server` 10、`AlertTriangle` 8、`Copy` 8、`Check` 7、`CheckCircle2` 7 |

高频图标集中在：刷新、文件夹、服务器、警告、复制、完成、下载、手柄、链接、搜索、玩家、加号、发送。

## 3. Aviala 的实际形态

从 npm 包与 `CONSUMER.md` 读到的事实：

| 项 | 事实 |
|---|---|
| 图标数 | **364 个**组件（不是 1000+） |
| 变体 | raw 里约 **1,785 个 SVG**；不是每个图标都有全部 5 种粗细 |
| 网格 | 120×120 `viewBox`，filled path，`currentColor`，无固定宽高 |
| 粗细 | `Light` / `Regular` / `Medium` / `Bold` / `Black` |
| 模式 | `default`（线性） / `fill`（填充） |
| 尺寸令牌 | `level`: `display` … `caption`；`biggerSize` 提升一档；`IconFrame` 对齐排版行高 |
| 缺失组合 | 回退到 `Medium/default`，再回退到任意可用变体——**不会报错** |
| 可访问性 | 装饰性默认 `aria-hidden`；语义图标用 `Icon` 的 `title` |
| 许可 | MIT |

官方推荐的用法是：

```tsx
import { Icon, DirectionArrowLeft } from "@aviala-design/icons";

<Icon icon={DirectionArrowLeft} level="text" thickness="Regular" mode="default" title="返回" />
```

而不是在页面里直接写 `<DirectionArrowLeft width={20} />`。这点必须遵守，否则粗细和字号会散。

## 4. 命名：需要认真对待的坑

Aviala 的名字是「分类 + 语义」的 PascalCase，和 Lucide 的直觉名完全不同：

| Lucide / 语义 | Aviala | 备注 |
|---|---|---|
| `ChevronLeft` | `DirectionArrowLeftLight` | 名字里的 **Light 是“chevron 少一横”**，不是粗细 |
| `ArrowLeft` | `DirectionArrowLeft` | 完整箭头 |
| `ChevronDown` | `DirectionArrowDownLight` | 同理 |
| `ChevronsUpDown` | `DirectionUnfold` | 上下展开 |
| `Check` | `SymbolRight` | “对” |
| `CheckCircle2` | `SymbolRightCircle` | 圆里有对勾 |
| `X` | `SymbolWrong` | 叉 |
| `Square`（停止） | `SymbolEnd` | 方形停止 |
| `Plus` | `SymbolAdd` | 加 |
| `Minus` | `SymbolLess` | 减 |
| `Settings` / `Settings2` | `GeneralSetting` | 齿轮 |
| `Terminal` | `DevelopTerminal` | 终端 |
| `Trash2` | `GeneralDelete` | 删除 |
| `Copy` | `EditCopy` | 复制 |
| `Paste` | `EditPaste` | 粘贴 |
| `Save` | `EditSave` | 保存 |
| `SlidersHorizontal` | `EditAdjust` | 调节 |
| `Download` | `GeneralDownload` | 下载 |
| `Upload` | `GeneralUpload` | 上传 |
| `ExternalLink` | `GeneralJumpOut` | 外跳 |
| `Globe` / `Globe2` | `SymbolInternet` | 互联网 |
| `Wifi` | `GeneralWifi` | Wi-Fi |
| `Router` | `DeviceRouter` | 路由器 |
| `Cpu` | `DeviceCpu` | CPU |
| `Laptop` | `DeviceLaptop` | 笔记本 |
| `Monitor` | `DeviceComputer` | 显示器/主机 |
| `Gamepad2` | `DeviceGameHandle` | 手柄 |
| `Users` | `UsersUserGroup` | 用户组 |
| `UserPlus` | `UsersUserAdd` | 加人 |
| `UserRound` | `UsersUser` | 用户 |
| `Shield` | `SafetySafe` | 安全 |
| `ShieldCheck` | `SafetySafeChecked` | 盾+勾 |
| `ShieldAlert` | `SafetyFirewall` | 防火墙 |
| `ShieldOff` | `SafetySafeFailed` | 失效 |
| `Clock` | `TimeAndDateClock` | 时钟 |
| `Timer` | `TimeAndDateTimer` | 计时器 |
| `Star` | `SymbolStar` | 星 |
| `Info` | `SymbolInformation` | 信息 |
| `AlertCircle` | `SymbolWarningCircle` | 圆警告 |
| `AlertTriangle` | `SymbolWarningTriangular` | 三角警告 |
| `CircleHelp` | `SymbolQuestionCircle` | 问号 |
| `Zap` | `WeatherFlash` | 闪电 |
| `Sparkles` | `AIIntelligent` | 四个尖的“智能” |
| `Package` | `ItemsProvisions`? | 看起来像餐盒/包裹，待确认 |
| `Folder` | `FilesFolder` | 只有闭合文件夹 |
| `FileText` | `FilesDocFile` | 文档 |
| `Archive` | `FilesFolderZip` | 导出名存在，raw 里没找到，需要确认 |
| `LayoutDashboard` | `DataDataDashboard` | 仪表盘 |
| `GitCompare` | `DevelopDiff` | diff |
| `Languages` | `GeneralTranslate` | 翻译 |
| `LifeBuoy` | `GeneralCustomerService` | 客服耳机 |
| `Palette` | `EditColorPicker` | 取色器 |
| `Power` / `Plug` | `DeviceSocket`? | 是墙插，不是插头/电源符号，待确认 |
| `Activity` | `DataLineChart`? | 折线图，不是波形 |
| `Network` | `SymbolInternet` / `DeviceRouter`? | 没有拓扑图 |
| `Boxes` / `Layers` | `SymbolApps`? | 四宫格，不是堆叠/图层 |
| `Tag` | `PayTicket`? | 票券，不是标签 |
| `ClipboardCopy` / `ClipboardPaste` | `EditCopy` / `EditPaste`? | 没有剪贴板 |
| `UserMinus` | `UsersUserSwitch`? | 用户切换，不是减人 |
| `Coffee` | `ItemsBeans`? | 咖啡豆，不是杯 |
| `Leaf` | `ItemsForest`? | 树，不是叶子 |
| `ScrollText` | `FilesDocFile`? | 文档，不是卷轴 |
| `Wand2` | `EditDrawPen`? | 笔，不是魔杖 |

**规则：页面里永远不出现 Aviala 的原始名。** 只出现我们自己的语义名（`server`、`play`、`folder-open`、`trash`），映射表集中在一个文件里。这样命名再抽象，也只在一个地方处理。

## 5. 映射结果

| 类别 | 数量 | 处理 |
|---|---:|---|
| 可直接/近义映射 | 约 65 | 直接进适配层 |
| 需要确认候选 | 17 | **先问用户**（见 §7） |
| 我判断确实没有 | 10 左右 | fallback 或自绘 |
| 不是图标 | 1（`Loader2`） | 改成 CSS spinner |

## 6. 体积：这条不能忽略

我用 esbuild 对打包后的图标做 tree-shaking 对比（minified，React external）：

| 场景 | Lucide | Aviala |
|---|---:|---:|
| 1 个图标 | 1.6 KB | 34.6 KB |
| 10 个图标 | 3.6 KB | 88.1 KB |
| 按 94 个估算 | ~35 KB | ~0.5 MB |

Aviala 每个图标会把多个粗细/填充变体一起打进组件，所以单图标成本高。`sideEffects: false` + ESM 能 tree-shake，但省不掉变体体积。

如果全量换，现有 `index` chunk 会再多 ~0.5 MB（minified，gzip 后约 +100 KB）。可以接受，但不应该无条件接受。

**更省的做法**：不 import React 包，只把需要的 SVG（比如只取 `Regular/default` + 少量 `fill`）以静态资源/sprite 的方式打包，`currentColor` + CSS mask。能把 94 个图标压到 ~100 KB 以内，但会失去运行时切粗细的能力，需要构建期生成。

## 7. 需要你确认的图标

我按“先问”的约定列出来。**这些是我拿不准、可能在 Aviala 里有别名，或者你能在 Figma 里找到的：**

1. **Server**（机架/塔式服务器，用了 10 次）——`DevelopRepository` 是书/仓库，`DeviceComputer` 是显示器，都不太像。
2. **FolderOpen**（打开文件夹，用了 14 次）——只看到 `FilesFolder` 闭合版；有没有 open 变体？
3. **Package / PackageSearch**（整合包/资源包，8 次）——`ItemsProvisions` 像餐盒，语义不确定。
4. **Plug**（插头，4 次）——`DeviceSocket` 是墙插，不是插头。
5. **Puzzle**（拼图/插件，3 次）——没看到拼图。
6. **Activity**（波形/性能，2 次）——`DataLineChart` 是折线图。
7. **Network**（网络拓扑，2 次）——`SymbolInternet` / `DeviceRouter` 都不是拓扑。
8. **ClipboardCopy / ClipboardPaste**（剪贴板，4 次）——`EditCopy/EditPaste` 没有剪贴板。
9. **Boxes / Layers**（堆叠/图层，2 次）——`SymbolApps` 是四宫格。
10. **Tag**（标签，1 次）——`PayTicket` 是票券。
11. **UserMinus**（移除玩家，1 次）——`UsersUserSwitch` 是切换。
12. **Coffee / Leaf**（茶品牌，2 次）——`ItemsBeans` / `ItemsForest` 都不是杯/叶。
13. **ScrollText**（日志/卷轴，1 次）——`FilesDocFile` 是文档。
14. **Import**（导入，1 次）——`GeneralDownload` 是下载。
15. **Wand2**（AI 配置，1 次）——`EditDrawPen` 是笔。
16. **Archive**（归档，1 次）——`FilesFolderZip` 在导出里存在，但 raw 里没找到，确认一下。
17. **Power**（电源，2 次）——`DeviceSocket` 是墙插。

**如果你也找不到，我建议 fallback 用 [Phosphor Icons](https://phosphoricons.com/)（MIT，1500+ 图标，含 light/regular/bold/fill 六种粗细）**，按 Aviala 的粗细档位映射，保证“看起来是同一套重量”。品牌专用的茶杯/茶叶可以自绘 2 枚，放进同一个 120 网格。

## 8. 建议的实施架构

不要直接 `import { SymbolPlay }` 散落各处。新增一个语义层：

```tsx
// components/ui/icon.tsx
export type IconName = "server" | "play" | "stop" | "folder-open" | "trash" | ...;

const REGISTRY: Record<IconName, { aviala?: AvialaIcon; fallback?: PhosphorIcon }> = {
  server: { fallback: Server },          // 待确认
  play: { aviala: SymbolPlay },
  "folder-open": { aviala: FilesFolder }, // 待确认
  ...
};
```

角色令牌（对应官方 `thickness` / `mode` / `level`）：

| 角色 | 尺寸 | Aviala |
|---|---|---|
| `inline` | `level="text"` | `Regular/default` |
| `control` | 20px 或 `level="subtitle"` | `Regular/default` |
| `nav` | 20px | `Regular/default` |
| `nav-active` | 20px | `Regular/fill` |
| `status` | 16px | `Bold/default`（无 Bold 则 Regular） |
| `empty` | 32–40px | `Light/default` |
| `brand` | 24px | `Medium/default` |

要点：

- 只用 `Icon` / `IconFrame` 组件和 `level` 令牌，不写死 `width`（除非是品牌标记）。
- 每个映射记录**可用变体**；请求不存在的粗细时，构建期就报错，而不是运行时静默回退。
- `title` 只给有语义的图标；装饰图标保持 `aria-hidden`。
- fallback 只对“确实没有”的图标启用，并在代码里标 `// fallback: no Aviala`，方便以后替换。
- 视觉验收看 20px 和 16px，不只看 40px 样张。

## 9. 成本

| 方案 | 工作量 | 风险 |
|---|---|---|
| 全量 Aviala + 自绘缺失 | 3–4 天 + 1 天视觉 QA | 高：94 个图标逐一比对，mixed 风格 |
| 语义层 + Aviala 高频 30 个 + fallback | 1.5–2 天 | 中：两套图标并存，需要角色令牌约束 |
| 只做语义层，暂不换 | 0.5–1 天 | 低：为以后换图标做好准备 |

**建议先做第三种的“语义层 + 角色令牌”，然后按 §7 的确认结果做第二种。** 不建议直接全量替换。

## 10. 数据来源

- `@aviala-design/icons@2.6.0` npm 包（MIT），`CONSUMER.md` / `README.md`
- 本地 esbuild tree-shake 对比
- `node scripts/icon-audit.cjs`（仓库内）
- 样张：`_probe-aviala.png`、`_probe-aviala2.png`（临时截图，不入库）
