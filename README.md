# Wulon's MCSS

<p align="center">
  <img src="resources/app-icon.png" width="112" alt="Wulon's MCSS" />
</p>

开服 + 开玩一体化的 Minecraft 工具。单实例灵便管理为骨架，玩家侧做到「收到一条链接就能进服」。

两种交付形态共用同一套 React UI 与同一份通道契约：

| 形态 | 需要什么 | 适合 |
|---|---|---|
| 桌面版 | `WulonsMCSS.exe`（免安装） | 服主日常：建服、管 Mod、备份、联机 |
| 网页版 + 助手 | 浏览器 + `mcss-agent.exe`（1.0MB，零依赖，后台运行） | 不想装大包，打开网页下载助手即用 |

网页版与桌面版**能力一致**，由脚本守着（`scripts/check-parity.cjs`，`pnpm test` 里带 `--strict`）。

## 快速开始（开发）

```bash
pnpm install
pnpm dev            # 桌面版
pnpm build:web      # 静态网页 → dist-web/
pnpm test           # 211 vitest + 72 node:test + 能力一致性检查
```

编译本地助手（Rust，零第三方依赖）：

```bash
cargo build --release --manifest-path agent/Cargo.toml
MCSS_CONFIG=./config.json ./agent/target/release/mcss-agent.exe
```

打包免安装版：

```bash
node package-win.js   # → wulons-mcss-b<版本>/WulonsMCSS-win32-x64
```

发布前自检与 agent 资产：

```bash
pnpm release:check            # 网页产物自检（CI 也跑）
pnpm release:check --package  # 连打包目录一起查：版本一致 / build-info / 新功能字符串
pnpm release:agent            # 编译 agent 并打成 Release 资产 + SHA256
```

## 它能做什么

**服主**
- 开服前预检 7 项 + 一键修复；崩溃翻译（7 类模式，带真动作）
- 控制台：日志解析、46 条指令补全、搜索、导出、卡顿记录
- 世界：多世界数据包（26.1 schema）、**时间机**（增量快照，磁盘 ≈ 一份世界 + 改动）、整包导出
- Mod：扫描 / 禁用 / 资源库安装 / Modrinth 自动匹配
- 自动化：每日重启、定时公告、定时备份
- 联机：FRP 隧道（助手可自动下载 frpc）

**玩家**
- 房间码自包含（地址 / 内网地址 / 版本 / 加载器 / Mod id）
- **客户端体检**：读本地 `.minecraft`，直接回答「能不能进」
- **同 WiFi 智能直连** + **活的房间状态**（在线人数、MOTD，走 Minecraft 服务器列表协议）
- 一键进服包 `.mrpack`（各启动器通用，含服务器列表）
- `mcss://install/<code>`：点链接自动准备好

**AI 后备链路**
- 排错知识库 + 一键提示词 + 现场包（日志/脱敏配置/知识库）
- 配置助手：自然语言 → 提示词 → 校验 AI 的 JSON → 应用

## 文档

- [PROJECT.md](PROJECT.md) —— 现状、没做完的、上线步骤
- [docs/AUDIT-2026-11-01.md](docs/AUDIT-2026-11-01.md) —— 网页版实测修复与安全复查
- [docs/WEB.md](docs/WEB.md) —— 网页版架构、配对、安全边界
- [docs/ROADMAP.md](docs/ROADMAP.md) —— 分期与进度
- [docs/ai/](docs/ai/) —— 给 AI 与人共用的排错知识库
- [agent/README.md](agent/README.md) —— 本地助手的环境变量与通道清单

## 没做完

- 启动器实例注入：最后一步「导入整合包」仍需手动
- 内置启动器（`--server` 直启）：没有
- 自动安装 Java：只探测不安装
- Gist 跨设备同步没有真机验证过
