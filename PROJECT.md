# Wulon's MCSS v28 · 现状

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
- 房间码自包含（地址 / 内网地址 / 版本 / 加载器 / Modrinth Mod id），可链接、可深链、可手抄
- **客户端体检**：读本地 `.minecraft`，直接回答「你能不能直接进」
- **同 WiFi 智能直连**：探测内网地址，通了就优先用（延迟从 60ms 降到 1ms 量级）
- **活的房间状态**：手写 Minecraft 服务器列表协议（SLP），邀请页显示「在线 3/10 人 + MOTD」
- 一键准备客户端：按 Modrinth id 拉 Mod（带哈希校验）
- 一键进服包：`.mrpack`（PCL2 / HMCL / Prism / Modrinth App 通用），含 `overrides/servers.dat`
- **直接进游戏**：复用玩家已装的版本，拼 classpath 带 `--server` 直启（不下载游戏、不碰账号）
- **`mcss://install/<code>`**：点链接就自动打包 + 打开启动器，不用再点按钮
- 启动器探测（PCL2 / 官方 / Modrinth / Prism / HMCL）并打开

**AI 后备链路**
- `docs/ai/` 知识库（症状→原因→修法 + 排错纪律）
- 诊断卡「让 AI 看看」复制提示词、「导出现场包」生成 zip（日志/脱敏配置/知识库）
- agent 版把知识库 `include_str!` 编进二进制
- **AI 配置助手**：描述需求 → 提示词 → 校验 AI 的 JSON（白名单 + 类型 + 枚举）→ 应用到表单

**工程**
- 网页版能力对齐 **100%**（`scripts/check-parity.cjs` 守门，`pnpm test` 里 `--strict`）
- 测试：129 vitest + 38 node:test + 15 Rust
- 增量备份「时间机」：sha1 内容寻址，磁盘 ≈ 一份世界 + 改动（Rust 自带零依赖 SHA-1）
- 下载链路：断点续传 / 多源回退 / 哈希校验 / 缓存命中
- 多世界生成逻辑在渲染层实现，CLI / 桌面 / 网页共用同一份代码

## 没做完

- **直接进游戏**已实现（复用已装版本 + `--server` 直启），但**没跑过一次真实的游戏进程**：
  只验证到「命令拼接正确」+「spawn 真的能起进程并执行」
- **正版登录**：只支持离线用户名（`Steve`），微软 OAuth 没做
- **没有对应版本时**：退回进服包，不做「替你下载游戏本体」
- **自动安装 Java**：没做。原来那个 `app:install-java` 空壳已经删掉——UI 里没人用，
  留一个「点了只是探测一下」的接口只会误导后来的人
- Modrinth 未匹配的 7 个 Mod 需要手动绑定
- **Gist 同步**已用「假 Gist 服务」跑通完整往返（推送 → 按配对码发现 → 解密 → 合并 →
  密文校验），但**没有对真实的 api.github.com 跑过**——那需要用户的 token，等他愿意给
- UI 交互没有自动化测试：页面渲染有 SSR 回归，但「点一下会怎样」仍靠 `scripts/ui-probe.cjs`
  （起真窗口 → 点按钮 → 截图 + 抓 DOM 文本，文本 < 20 字符判黑屏）而不是断言级测试

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
