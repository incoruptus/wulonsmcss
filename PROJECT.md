# 乌龙味 MC 开服茶 · Wulon's MCSS

**一站式 Minecraft 服务器管理桌面应用**

基于 Electron + Vue 3 构建，提供图形化的服务器生命周期管理、Mod/玩家/配置管理功能，支持 Material You 动态主题色和自定义壁纸。

---

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 框架 | Electron 33 + Vue 3.5 | 桌面 GUI + 响应式 UI |
| 构建 | electron-vite 5 + Vite 6 | 三端打包（主进程/预加载/渲染进程） |
| UI | @material/web 2.4 (MD3) | Material Design 3 组件库 |
| 原子化 CSS | UnoCSS | 按需生成样式，零运行时 |
| 状态管理 | Pinia 3 | 全局状态（主题/服务器/动画/通知） |
| 路由 | Vue Router 4 | 页面导航、Hash History |
| 动画 | CSS @keyframes + 自定义 easing | 渐变过渡、交错进场、涟漪反馈 |
| 图标 | Material Symbols | 1:1 三端图标（圆体/细体/锐体 各 7000+） |
| 字体 | OPPO Sans UI + Cascadia Code | 中英文 UI + 等宽终端字体 |
| 包管理 | pnpm 11 | 依赖管理及工作区 |
| 打包 | electron-builder / @electron/packager | NSIS 安装包 / 便携版 exe |

---

## 项目结构

```
wulons-mcss/
├── electron/
│   ├── main.ts              ← 主进程入口：窗口管理、IPC 注册
│   ├── entry.cjs             ← Electron 启动入口
│   ├── ipc/
│   │   ├── server.js         ← MC 服务器进程管理（启动/停止/命令）
│   │   └── files.js          ← 文件 I/O、Config 读写、Mod 元数据提取
│   └── preload/
│       └── index.ts          ← 预加载桥：contextBridge 暴露 API
├── src/renderer/
│   ├── main.ts               ← Vue 应用挂载点
│   ├── App.vue               ← 根组件：TitleBar + Sidebar + RouterView
│   ├── env.d.ts              ← ElectronAPI 类型声明
│   ├── router/index.ts       ← 路由配置（Hash 模式）
│   ├── stores/               ← Pinia 存储
│   │   ├── app.ts            ← 主题、壁纸、主题色、色调生成
│   │   ├── server.ts         ← 服务器状态、日志、TPS、玩家列表
│   │   ├── animation.ts      ← 动画开关、--anim-modifier 控制
│   │   └── notifications.ts  ← Toast 通知队列
│   ├── views/                ← 页面组件（8 个）
│   │   ├── Dashboard.vue     ← 仪表盘：启动按钮、统计卡片、快捷操作、最近日志
│   │   ├── Console.vue       ← 控制台：实时日志流
│   │   ├── ServerConfig.vue  ← 服务器配置：表单/源码模式编辑 server.properties
│   │   ├── Players.vue       ← 玩家管理：OP/白名单
│   │   ├── Mods.vue          ← Mod 管理：安装/删除/搜索
│   │   ├── Settings.vue      ← 设置：外观/性能/路径/备份/关于
│   │   ├── VersionCompare.vue← 版本比对：导入/导出/差异对比
│   │   ├── Game.vue          ← 游戏操作（预留）
│   │   └── Frp.vue           ← FRP 隧道管理
│   ├── components/           ← 通用组件
│   │   ├── TitleBar.vue      ← 自定义标题栏（无边框窗口）
│   │   ├── Sidebar.vue       ← 侧边导航栏
│   │   ├── ToastContainer.vue← Toast 通知容器
│   │   ├── SetupDialog.vue   ← 首次运行设置向导
│   │   ├── PropsEditor.vue   ← server.properties 语法高亮编辑器
│   │   ├── SegmentedButton.vue ← 分段按钮组件
│   │   ├── AddActionDialog.vue  ← 添加快捷操作对话框
│   │   └── EditActionsDialog.vue← 编辑快捷操作对话框
│   ├── styles/
│   │   ├── global.css        ← 全局样式、滚动条、CSS 变量
│   │   ├── animations.css    ← 动画系统：关键帧、过渡类、交错
│   │   ├── md3-theme.css     ← Material 3 主题 token
│   │   └── fonts.css         ← 字体声明
│   └── directives/
│       └── ripple.ts         ← 涟漪动画指令
├── resources/
│   ├── app-icon.png          ← 应用图标
│   ├── fonts/                ← OPPO Sans / Cascadia Code 字体
│   └── wallpaper.jpg         ← 默认壁纸
├── package-win.js            ← 手动打包脚本（@electron/packager + asar）
├── electron-builder.yml      ← electron-builder 配置（NSIS 安装包）
└── electron.vite.config.ts   ← electron-vite 三端构建配置
```

---

## 架构设计

### 三进程模型

```
┌─────────────┐     IPC      ┌──────────────┐
│  主进程       │◄───────────►│  渲染进程      │
│  main.ts     │   invoke     │  Vue 3 App   │
│  server.js   │   on/handle  │  Pinia Store │
│  files.js    │              │  Components  │
└──────┬───────┘              └──────┬────────┘
       │                            │
       │  preload/index.ts          │
       │  contextBridge             │
       │  (安全隔离)               │
       └────────────────────────────┘
```

- **主进程** (`electron/main.ts`)：管理窗口生命周期、注册所有 IPC handler。通过 `server.js` 启动/停止 Minecraft 服务器进程，通过 `files.js` 进行文件 I/O 和配置读写
- **预加载脚本** (`electron/preload/index.ts`)：通过 `contextBridge.exposeInMainWorld` 暴露有限的 API 给渲染进程。使用单回调模式防止页面重载导致监听器重复注册
- **渲染进程** (`src/renderer/`)：Vue 3 SPA，通过 `window.electronAPI` 调用 IPC，不直接访问 Node.js API

### IPC 通信模式

所有渲染进程 → 主进程的调用统一走 `ipcMain.handle` + `ipcRenderer.invoke`（请求-响应模式）。
事件推送（服务器日志、状态变更）走 `webContents.send` + `ipcRenderer.on`。

### 配置持久化

- **开发环境**：config.json 存储在项目根目录
- **生产环境**：config.json 存储在 `app.getPath('userData')`（如 `%APPDATA%/WulonsMCSS/`）
- 写入采用「读取→合并→写入」模式防止字段丢失
- save() 使用 300ms debounce 防止高频写入

### 主题系统

Material You 动态主题色。用户选择主色后，`app.ts` 的 `setPrimaryColor()` 自动计算：
- Primary / Secondary / Tertiary 色系
- 各色调容器色 (Container)
- 暗色模式适配
- 通过 `<style id="theme-override">` 注入 CSS 变量

### 动画系统

`animation.ts` 通过 Pinia store 控制 `--anim-modifier` CSS 变量：
- `--anim-modifier: 1` → 动画正常播放
- `--anim-modifier: 0` → 全局禁用动画
- 所有动画 duration 使用 `calc(base * var(--anim-modifier, 1))`
- 交错进场通过 `--anim-stagger` 控制子元素延时

---

## 开发命令

```bash
pnpm dev        # 启动 Vite dev server + Electron
pnpm build      # 三端构建（out/ 目录）
pnpm lint       # ESLint 检查
```

## 打包命令

```bash
pnpm dist                       # electron-builder → NSIS 安装包
node package-win.js             # 手动打包 → 便携版 exe
```

打包输出路径：`../wulons-mcss-b26.7.01/`

---

## 关键设计决策

| 决策 | 理由 |
|------|------|
| 无边框窗口 + 自定义 TitleBar | 统一跨平台视觉风格 |
| 三端构建（main/preload/renderer） | 安全隔离，渲染进程不访问 Node.js |
| `contenteditable` 语法高亮编辑器 | 替代 `<textarea>`，保留全语法高亮 |
| hash 路由 | Electron 无需服务端路由支持 |
| 轻量依赖（无 UI 框架） | 减少体积，直接使用 @material/web Web Components |
| 主进程不在 ASAR 中读配置 | 生产环境改为 userData 路径以支持写操作 |