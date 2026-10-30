# Wulon's MCSS v28 · 现状

> 最后一次更新：2026-10-30。这份文件是给「三天后的自己」和「第一次打开仓库的人」看的。

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
- Mod / 插件：扫描元数据、禁用/启用；资源库内嵌在内容页（中文名 + 中文简介 + 标签筛选 + 详情 + 逐版本安装），**Modrinth 自动匹配**（真实 25 个命中 18）
- 资源库中文名来自 MC 百科（经 PCL 整理，5338 条），中文简介走 MCIM 机翻；详见 `docs/ZH-NAMES.md`
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
- 网页版能力对齐 **100%**（75 个通道，`scripts/check-parity.cjs` 守门，`pnpm test` 里 `--strict`）
- 测试：192 vitest + 72 node:test + 20 Rust；另有 `scripts/web-e2e.cjs` 16/16
- NeoForge 新建暂不支持；已有 NeoForge 目录仍可导入/预检/启动
- 已有客户端开服：`client:scan` 识别版本/加载器/Mod，`CreateServerFromClientDialog` 创建服务端，`ModsTab` 可勾选客户端 Mod 一键回灌（Modrinth 下载，失败复制本地 jar）
- 增量备份「时间机」：sha1 内容寻址，磁盘 ≈ 一份世界 + 改动（Rust 自带零依赖 SHA-1）
- 下载链路：断点续传 / 多源回退 / 哈希校验 / 缓存命中
- 多世界生成逻辑在渲染层实现，CLI / 桌面 / 网页共用同一份代码

**2026-10-30 界面重构**
- 侧栏以当前实例为中心：控制台/配置/模组/世界/玩家 全部提到一级；切换器/全部实例/设置/模式段收到底部
- 资源库从一级页面移进「模组/插件」页：PCL 式高密度列表（图标/中文名/标签/版本/简介）、标签+环境筛选、详情与逐版本安装
- 下拉全部自绘（`Picker`）；右键菜单只在桌面版接管（复制/全选/翻译），网页版保留浏览器原生菜单
- 移除自选强调色；控制台固定逐行等宽（删掉从未生效的「气泡」设置）
- 中文名 5338 条、中文简介按需机翻；新增 `/instances/:id/content?view=browse&q=` 深链

**2026-10-30 新手人体工学 + 对抗性审查**
- 首次开服改为「意图卡 → 版本卡（带 Mod/插件数量、Java 25/21）→ 确认」；名称预填、高级项折叠、禁用按钮给原因
- Java 版本矩阵（26→25、1.20.5+→21、1.18+→17），不再把 Java 21 塞给 26.x
- 配置页 server.properties 全中文化（11 开关 + 3 枚举 + 7 文本键）；EULA 改为知情同意；停服统一确认
- 加入页默认 `.minecraft` 修正；房间打开自动存“我的服务器”；直接启动标明离线身份
- 安全：`?agent=` 只允许 loopback；config 原子写+备份；client.prepare 文件名清洗；下载无 hash 不缓存、跟随 3xx；openExternal 白名单；servers.dat 读不懂不覆盖；zip 解析上限
- 网页边界：定时任务/停服备份/樱花穿透明确标注；Join 窄屏隐藏侧栏

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
