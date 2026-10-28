# Wulon's MCSS · 乌龙味 MC 开服茶

**一站式 Minecraft 服务器管理桌面应用**
Electron + React 19 + Tailwind v4，面向零基础用户：选版本 → 装 Mod → 配联机 → 一键开服。

> v27 重构版（2026-10）。v26 的 Vue 3 + Material You 版本见 git 历史 `ea78a05`。

---

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 框架 | Electron 33 + React 19 | 桌面外壳 + 函数式 UI |
| 构建 | electron-vite 5 + Vite 5 | 三端打包（主进程 / 预加载 / 渲染） |
| 样式 | Tailwind CSS v4 + Geist 设计令牌 | 原子化样式，令牌与 WulonVocab 同源 |
| 组件 | Radix UI primitives | 无障碍弹窗 / 菜单 / 开关 / 滑杆 |
| 状态 | Zustand 5 | 配置、服务器状态、日志流 |
| 路由 | React Router 7（Hash） | `file://` 下无刷新路由 |
| 图标 | lucide-react | 统一线性图标 |
| 字体 | Sora（拉丁，随包）→ 系统黑体链 | 中文回退到 PingFang / 微软雅黑 |
| 提示 | sonner | Toast |

渲染进程不直接碰 Node：全部能力经 `window.mcss`（contextBridge）走 IPC。

---

## 目录结构

```
wulons-mcss/
├── electron/
│   ├── main.ts               ← 窗口、IPC 注册、生命周期（薄壳）
│   ├── preload/index.ts      ← contextBridge：window.mcss
│   └── ipc/
│       ├── config.js         ← 配置读写 + v26→v27 迁移
│       ├── server.js         ← 服务器进程：启动/停止/stdin/日志/内存
│       ├── versions.js       ← Mojang 清单 / Fabric Meta / 流式下载
│       ├── mods.js           ← ZIP 中央目录解析 + fabric.mod.json 扫描
│       ├── worlds.js         ← 多世界数据包（调用 MWM CLI）
│       ├── files.js          ← 文件与 server.properties
│       └── java.js           ← Java 运行时探测
├── src/renderer/
│   ├── main.tsx / App.tsx    ← 入口 / 布局与路由
│   ├── pages/                ← Overview · Instances · InstanceDetail · Settings
│   ├── components/
│   │   ├── app/              ← TitleBar（自绘无边框）、Sidebar、PageHeader
│   │   ├── ui/               ← Geist 组件（移植自 WulonVocab）
│   │   └── instance/         ← 实例详情各 Tab 与新建向导
│   ├── stores/               ← config / server（zustand）
│   ├── lib/                  ← api 类型、types、utils
│   └── styles/globals.css    ← 设计令牌 + 字体栈 + 工具类
├── wulons-mcss-mwm/          ← 子项目：多世界数据包 CLI（Node ESM）
├── wulons-mcss-mwm-mod/      ← 子项目：游戏内世界切换模组（Fabric）
└── package-win.js            ← 便携版打包
```

---

## 数据模型（config.json · v27）

```ts
interface AppConfig {
  version: 27
  theme: 'light' | 'dark' | 'system'
  accent: string
  instances: Instance[]        // 多实例：各自独立的版本 / Mod / 配置 / 存档
  activeInstanceId: string | null
  consoleViewMode: 'code' | 'bubble'
  maxLogLines: number
  quickActions: QuickAction[]
  frpProfiles: FrpProfile[]
  sync: SyncConfig | null      // GitHub Gist 跨端同步
  setupComplete: boolean
}
```

`Instance` = `{ id, name, dir, mcVersion, loader, loaderVersion, javaPath, memoryMin, memoryMax, jvmArgs, port, ... }`。

**迁移**：v26 的扁平 `serverPath / javaPath / maxMemory / initMemory / jvmArgs` 会
在首次读取时收敛成一条 `id: "legacy"` 的实例；主题、控制台视图、动画开关一并保留。

---

## 开发命令

```bash
pnpm dev          # Vite dev server + Electron
pnpm build        # 三端构建（out/）
pnpm typecheck    # tsc --noEmit（渲染进程，当前为绿）
pnpm test         # vitest（同步内核）
node package-win.js   # 便携版打包 → ../wulons-mcss-b27.0.0/
```

---

## 设计系统

- **令牌**：background-100/200 + 10 级灰 + blue/green/amber/red 语义色（`globals.css`）
- **强调色**：`<html data-accent>` + `--ui-accent-hex`，blue 色阶整体重定向
- **字体**：`Sora → PingFang SC → HarmonyOS Sans SC → 微软雅黑 → system-ui`
- **体例**：`.t-h-24 / .t-label-13 / .t-mono-12` 等字号工具类，与 WulonVocab 一致

---

## 当前进度

| 模块 | 状态 |
|------|------|
| 三端重构（React 19 + Tailwind 4 + Radix） | ✅ |
| 多实例：列表 / 新建（真实的 Mojang + Fabric 下载）/ 编辑 / 删除 | ✅ |
| 服务器进程：启动/停止/指令/日志/内存/TPS | ✅ |
| 实例详情：概览 / 控制台 / 配置 / Mod / 世界 / 玩家 | ✅ |
| Mod 扫描（ZIP 直读 `fabric.mod.json`）与**客户端 ↔ 服务端比对** | ✅ |
| 多世界数据包（生成 / 删除 / 扫描） | ✅ |
| GitHub Gist 跨端同步（配对码 + AES-GCM + 分片 + 中转站认领） | ⏳ 下一阶段 |
| 资源库（Modrinth 搜索 / 一键装 Mod） | ⏳ |
| FRP 隧道（通用 frpc + SakuraFrp） | ⏳ |
| 零基础开服向导（版本 → Mod → 联机 → 开服） | ⏳ |

---

## 维护记录

### 2026-10-28 · v27 重构

- 技术栈从 Vue 3 + Material You 换成 **React 19 + Vite + Tailwind v4 + Radix**，
  完全复用 WulonVocab 的 Geist 设计令牌与 UI 组件；Next.js 被评估后否决
  （静态导出后 SSR/RSC 归零，`file://` 下 App Router 还需额外适配）。
- 字体回退按要求改为 **Sora → 系统黑体链**，正文不再依赖 22MB 的 OPPO Sans。
- 信息架构按「实例」重组：概览 / 实例 / 实例详情（6 个 Tab）/ 设置。
- 主进程拆成 `electron/ipc/*` 七个模块，`main.ts` 只做窗口与 IPC 注册。
- `mods.js` 用 ZIP 中央目录 + `zlib.inflateRawSync` 直读 jar，替代原来的 `tar` 子进程。
- 配置升级为 v27（多实例），并带自动迁移。

### 2026-10-28 · v26 接管修复

| 问题 | 处理 |
|------|------|
| `server.js` 的 `sendCommand` 被截断，应用启动即崩 | 重写该模块（stdin 写入 + 回显 + 错误处理） |
| 设置里的内存从未传给 JVM | 启动时拼 `-Xms/-Xmx` |
| 打包版「创建世界」必失败 | CLI 移到 asar 外，用 `ELECTRON_RUN_AS_NODE` 调 |
| 打包版换壁纸静默失败 | 改存 `userData/wallpapers` |
| 无版本控制 | `git init` + `.gitignore`，建立基线 |

---

## 已知限制

- 同一时刻只运行一个服务器实例（进程管理是单例，UI 以「当前实例」为准）。
- 「重置全部设置」会清空实例列表，但不会删除磁盘上的服务器文件。
- FRP / 资源库 / 同步的 IPC 已预留通道，当前调用会返回「尚未接入」。
