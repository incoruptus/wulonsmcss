# 技术栈一览 · Wulon's MCSS 生态

> 整理于 2026-08-17

---

## 一、Wulon's MCSS — 桌面管理端

| 层级 | 技术 | 用途 |
|------|------|------|
| 框架 | Electron 33 + Vue 3.5 | 桌面 GUI + 响应式 UI |
| 构建 | electron-vite 5 + Vite 6 | 三端打包（主进程/预加载/渲染进程） |
| UI | @material/web 2.4 (MD3) | Material Design 3 Web Components |
| 原子化 CSS | UnoCSS 66 + preset-uno | 按需生成样式，零运行时 |
| 状态管理 | Pinia 3 | 全局状态（主题/服务器/动画/通知） |
| 路由 | Vue Router 4 | 页面导航、Hash History |
| 动画 | CSS @keyframes + 自定义 easing | 渐变过渡、交错进场、涟漪反馈 |
| 图标 | Material Symbols 0.45 | 1:1 三端图标（圆体/细体/锐体） |
| 字体 | OPPO Sans UI + Cascadia Code | 中英文 UI + 等宽终端字体 |
| 包管理 | pnpm 11 | 依赖管理及工作区 |
| 代码检查 | ESLint 9 + TypeScript 5.7 | 类型检查 + 代码规范 |
| 打包方案 | electron-builder 26 (NSIS) / @electron/packager (便携版) | 安装包 + 绿色版 |
| 开发语言 | TypeScript 5.7 / JavaScript | 主进程 + 渲染进程 |

### 关键依赖

```
dependencies:
  @material/web ^2.4.0     — MD3 组件库
  material-symbols ^0.45.0 — Material Symbols 图标
  pinia ^3.0.0             — 状态管理
  vue ^3.5.0               — 渲染框架
  vue-router ^4.5.0        — 路由

devDependencies:
  electron ^33.4.11        — 桌面框架
  electron-vite ^5.0.0     — 构建工具链
  electron-builder ^26.15.3 — 安装包打包
  @electron/packager ^20.0.2 — 便携版打包
  @electron/asar ^4.2.0    — asar 归档
  vite ^6.0.0 (via electron-vite) — 底层构建
  unocss ^66.0.0           — 原子化 CSS
  @unocss/preset-uno ^66.0.0
  @unocss/transformer-directives ^66.0.0
  @vitejs/plugin-vue ^5.2.0
  typescript ^5.7.0
  vue-tsc ^2.2.0
  eslint ^9.0.0
  @typescript-eslint/parser ^8.0.0
  @typescript-eslint/eslint-plugin ^8.0.0
  eslint-plugin-vue ^9.32.0
```

---

## 二、wulons-mcss-mwm-mod — Minecraft Fabric 模组

| 层级 | 技术 | 用途 |
|------|------|------|
| 语言 | Java 25 | 模组逻辑 |
| 构建工具 | Gradle + Fabric Loom 1.15 | 编译/打包 |
| Minecraft 版本 | 26.1 (1.21.4) | 目标版本 |
| Fabric Loader | 0.19.3 | 模组加载器 |
| 映射 | Fabric Intermediary 26.1 | 混淆映射 |
| 网络通信 | Minecraft CustomPayload | 客户端-服务端数据同步 |
| 指令系统 | Fabric 指令 API | `/mwm` 指令集 |

### 功能概要

- 游戏内左下角 HUD 世界切换器（P 键开关）
- 点击传送至目标世界
- 服务端 `/mwm world list` / `/mwm world tp <id>` 指令

---

## 三、wulons-mcss-mwm — 数据包生成 CLI

| 层级 | 技术 | 用途 |
|------|------|------|
| 语言 | JavaScript (ESM) | CLI 工具逻辑 |
| 运行时 | Node.js | 执行环境 |
| 构建工具 | 无（纯 Node.js 脚本） | 无需打包 |
| 包管理 | npm | 依赖管理 |

### 功能概要

- 读取 `worlds.json` 配置
- 生成 Minecraft 数据包（dimension / dimension_type JSON）
- 支持世界类型：主世界、下界、末地、超平坦、虚空
- 支持模组生物群系集成（Biomes O' Plenty、Traverse、Terralith）

---

## 四、Minecraft 服务端

| 层级 | 技术 | 用途 |
|------|------|------|
| 服务端核心 | Minecraft 26.1 (1.21.4) Server | 游戏服务器 |
| 服务端实现 | Fabric 0.16.10 | 模组加载 |
| Java | JDK 21.0.6+7 | 服务端运行环境 |
| 正版验证 | authlib-injector | 外置登录 |
| 包管理 | pnpm 11 | 工作区依赖管理 |

### 服务端 Mod 清单

| Mod | 版本 | 用途 |
|-----|------|------|
| Fabric API | 0.154.2+26.1.2 | API 基础 |
| Fabric Language Kotlin | 1.13.12+kotlin.2.4.0 | Kotlin 支持 |
| JEI 物品管理器 | 29.16.0.46 | 物品配方查询 |
| Xaero 小地图 | 26.1.2-26.2.0 | 小地图 |
| Xaero 世界地图 | 26.1.2-1.42.0 | 世界地图 |
| Jade 🔍 | 26.1.8 | 信息显示 |
| Distant Horizons | 3.2.0-b-26.1.2 | 远距离渲染 |
| Terralith | 2.6.2 | 生物群系/地形生成 |
| Ecologics | 2.5.3 | 生物群系丰富 |
| Traverse | 9.0.0 | 生物群系扩充 |
| 苹果皮 (Appleskin) | 3.0.9 | 饱食度显示 |
| 实体渲染优化 | 1.10.5 | 性能优化 |
| 铁氧体磁芯 (FerriteCore) | 9.0.0 | 内存优化 |
| 更多动画 | 1.12.4 | 动画增强 |
| 物理声效重制版 | 1.5.1+26.1.2 | 物理音效 |
| 真实物理 (Physics Mod) | 3.1.41 | 物理效果 |
| 森罗物语：厨房 | 1.4.1.2 | 食物/厨房内容 |
| 森罗物语酒馆 | 1.2.0.1 | 酒馆内容 |
| CreativeCore | 2.14.13 | 前置库 |
| Cloth Config | 26.1.154 | 配置 API |
| Forge Config API Port | 26.1.5 | 兼容层 |
| Yet Another Config Lib | 3.9.5 | 配置库 |
| PrickleMC | 26.1.2.6 | 功能扩展 |
| Lithostitched | 1.7.13 | 结构生成调整 |
| Wulon's MWM Mod | 26.1.0 | 多世界管理 |

---

## 五、单体架构总览

```
┌─────────────────────────────────────────────────────────┐
│                  Wulon's MCSS 生态                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  MCSS 桌面端 (Electron + Vue 3)                  │   │
│  │  · 主进程: 窗口管理, IPC, 服务器进程, 文件 I/O     │   │
│  │  · 预加载: contextBridge 安全桥                   │   │
│  │  · 渲染进程: Vue 3 SPA, Pinia 状态管理            │   │
│  └───────────────────┬─────────────────────────────┘   │
│                      │ IPC + 指令                       │
│  ┌───────────────────▼─────────────────────────────┐   │
│  │ Minecraft 服务端 (Fabric 26.1)                   │   │
│  │  · 模组: MWM Mod, Terralith, 性能优化等 20+      │   │
│  │  · 数据包: 自定义维度 (由 CLI 生成)               │   │
│  └───────────────────┬─────────────────────────────┘   │
│                      │ CustomPayload                    │
│  ┌───────────────────▼─────────────────────────────┐   │
│  │ 游戏内客户端 (Minecraft + Fabric Mod)             │   │
│  │  · MWM Mod: 左下角世界切换器 HUD                  │   │
│  │  · Xaero 地图, JEI, 物理声效等                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ CLI 工具 (wulons-mcss-mwm)                       │   │
│  │  · 读 worlds.json → 生成数据包 JSON               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 六、开发环境

| 工具 | 版本 |
|------|------|
| pnpm | ^11.12.0 |
| Node.js | ^20.19.0 / >=22.12.0 |
| JDK | 21.0.6+7 |
| Gradle | 8.x (via Fabric Loom 1.15) |
| IDE | VSCode / JetBrains |

---

## 七、构建与打包

| 命令 | 产物 | 工具 |
|------|------|------|
| `pnpm dev` | 开发服务器 + Electron | electron-vite |
| `pnpm build` | out/ 三端构建产物 | electron-vite |
| `pnpm dist` | NSIS 安装包 | electron-builder |
| `node package-win.js` | 便携版 exe | @electron/packager |
| `./gradlew build` | Fabric 模组 jar | Gradle + Fabric Loom |
| `node src/cli.js` | 数据包文件夹 | 原生 Node.js |