# Wulon's MCSS v27 · 现状

> 最后一次更新：2026-10-28。这份文件是给「三天后的自己」和「第一次打开仓库的人」看的。

## 一句话

本地 Minecraft 服务器管理器：**单实例灵便管理 + 玩家零门槛进服**，桌面版与网页版共用同一套 UI。

## 三种用法

| 用法 | 需要什么 | 适合 |
|---|---|---|
| 桌面版 | `WulonsMCSS.exe`（271MB，免安装） | 服主日常：建服、管 Mod、备份、联机 |
| 网页版 + 助手 | 浏览器 + `mcss-agent.exe`（0.36MB） | 不想装大包、只想进服或开个轻量服 |
| 纯网页 | 浏览器 | 解析房间码、看房间信息、复制地址 |

## 已做完

**服主**
- 开服前预检 7 项（Java / jar / EULA / 端口 / 数据包 / 内存 / 磁盘）+ 一键修复
- 控制台：日志解析、46 条指令补全、搜索高亮、导出、**卡顿记录**（tick 落后告警）
- 崩溃翻译官：7 类高置信模式 + 真动作（禁用 Mod、修 26.1 数据包）
- 世界：多世界数据包生成（26.1 schema）、备份/恢复、停服自动备份 + 保留份数
- Mod：扫描元数据、禁用/启用、资源库搜索安装、**Modrinth 自动匹配**（真实 25 个命中 18）
- 自动化：每日重启、定时公告、定时备份（纯函数 + 6 项单测）
- 联机：FRP 隧道、邀请码

**玩家**
- 房间码自包含（地址/版本/加载器/Modrinth Mod id），可链接、可深链、可手抄
- 一键准备客户端：按 Modrinth id 拉 Mod
- 一键进服包：`.mrpack`（PCL2 / HMCL / Prism / Modrinth App 通用），含 `overrides/servers.dat`
- 启动器探测（PCL2 / 官方 / Modrinth / Prism / HMCL）并打开

**AI 后备链路**
- `docs/ai/` 知识库（症状→原因→修法 + 排错纪律）
- 诊断卡「让 AI 看看」复制提示词、「导出现场包」生成 zip（日志/脱敏配置/知识库）
- agent 版把知识库 `include_str!` 编进二进制

## 没做完

- **启动器实例注入**：现在只到「帮你打开启动器」，最后一下仍要手点
- **内置启动器**：没有
- 网页版缺 `versions:*` / `frp:*` / `worlds:*`（会提示「需要桌面版」）
- Modrinth 未匹配的 7 个 Mod 需要手动绑定

## 11 月 1 日上线要做什么

仓库建好后：

```bash
git remote add origin <repo>
git push -u origin master
```

然后在仓库 Settings → Pages → Source 选 **GitHub Actions**。`.github/workflows/pages.yml` 会自动 typecheck → `build:web` → 发布 `dist-web`。

需要确认的两件事：
1. `pnpm-lock.yaml` 已提交（CI 用 `--frozen-lockfile`）
2. 页面用相对路径 + Hash 路由，挂在 `/<repo>/` 子目录也能跑

## 常用命令

```bash
pnpm dev            # 桌面版开发
pnpm build          # 三端构建
pnpm build:web      # 静态网页 → dist-web/
pnpm test           # vitest + node:test
cargo build --release --manifest-path agent/Cargo.toml
node package-win.js # 免安装包
node scripts/web-shot.cjs          # 网页版截图
node scripts/web-dump.cjs "/settings"  # 抓任意路由文本
```

## 验证脚本

| 脚本 | 验什么 |
|---|---|
| `scripts/web-e2e.cjs` | agent 契约（健康/令牌/配置/SSE） |
| `scripts/agent-client-e2e.cjs` | 写服务器列表 / 拉 Mod / 导出 mrpack |
| `scripts/agent-backup-e2e.cjs` | 备份创建→恢复→删除 + 路径穿越拒绝 |
| `scripts/agent-mods-e2e.cjs` | Modrinth 搜索 / 安装 / Mod 扫描 |
| `scripts/agent-ai-e2e.cjs` | 现场包结构与脱敏 |
| `scripts/crash-shot.cjs` | 占端口→起服→诊断卡截图 |
