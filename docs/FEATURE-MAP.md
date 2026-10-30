# 功能地图（2026-10-30）

> 目的：回答“这个工具到底有什么、哪些是真的能用、哪些只是看起来有”。
> 状态分四档：✅ 已验证 / 🟡 部分可用 / 🖥️ 仅桌面 / ⛔ 未完成（界面不应承诺）。

## 0. 形态

| 形态 | 入口 | 说明 |
|---|---|---|
| 桌面版 | `WulonsMCSS.exe`（Electron 33） | 直接管本机进程/文件，支持定时任务、樱花穿透、停服备份 |
| 网页版 + 助手 | 浏览器 + `mcss-agent.exe` | 同一套 React UI，经 `window.mcss` 契约走本机 HTTP；有 4 处桌面独有能力（见 #17/#9） |
| 纯网页 | 浏览器 | 解析房间码、看房间信息；开服/读文件要助手 |

## 1. 路由

| 路由 | 页面 | 入口 |
|---|---|---|
| `/` | 服主：`Overview` 仪表盘；玩家：`Join` | 模式决定 |
| `/instances` | 全部服务器 | 侧栏底部「全部实例」 |
| `/instances/:id` | 实例概览 | 深度链接/新建后 |
| `/instances/:id/:tab` | 控制台/配置/内容/世界/玩家 | 侧栏六项 |
| `/library` | 重定向到当前实例 `content?view=browse` | 旧书签 |
| `/network` | 让外网的朋友进来（FRP） | 侧栏「联机」 |
| `/mine` | 我的服务器（玩家收藏） | 玩家导航 |
| `/client` | 我的客户端（玩家扫描） | 玩家导航 |
| `/join`、`/join/:code` | 加入游戏/体检/进服 | 玩家首页、邀请链接 |
| `/settings` | 设置 | 侧栏底部 |

## 2. 能力矩阵

| # | 功能 | 入口 | 实现 | 测试 | 状态 / 边界 |
|---|---|---|---|---|---|
| 1 | 建服（Vanilla/Fabric/Paper/Purpur/Forge/NeoForge） | 新建服务器 / 首次向导 | `electron/ipc/versions.js`、`CreateInstanceDialog`、`FirstRunWizard` | versions 12 例 + 真机 Paper/Forge 装过 | ✅ 六家都实现了；NeoForge 受 maven 网络影响（本机 DNS 污染时明确报错） |
| 2 | 开服前预检（Java/jar/EULA/端口/数据包/内存/磁盘） | 启动按钮 | `preflight.js`、`PreflightDialog` | preflight 5 例 + 真机 | ✅；EULA 现在是**显式同意**，端口可弹窗内改，jar 缺失不再给假“修复” |
| 3 | 启停/控制台 | 侧栏控制台 | `server.js`、`ConsoleTab` | server 3 例 + smoke | ✅ 日志分级/搜索/导出/补全/卡顿/崩溃诊断；右键菜单仅桌面 |
| 4 | 配置 | 侧栏配置 | `ConfigTab` + `server-properties` | 新增词典测试 | ✅ 7 文本键 + 3 枚举 + 11 开关已中文化；未覆盖的键仍可进「原始文件（高级）」 |
| 5 | Mod/插件 | 侧栏内容 | `ModsTab`/`PluginsTab`/`ResourceBrowser` | client 6 例、资源库无单测 | ✅ 扫描/启停/比对/资源库；**不自动装前置依赖**（见 #16 风险） |
| 6 | 资源库 | 内容 → 资源库 | 同上 + `modrinth.js` | 手动 e2e（project/translate/install） | ✅ 中文名 5338 条、中文简介 MCIM、分类/环境筛选、详情/逐版本安装；仅 Modrinth |
| 7 | 世界/备份/时间机 | 侧栏世界 | `WorldsTab`、`backup.js`、`backups.js` | backup 12 例、快照 3 例 | ✅ 整包 zip + 增量快照；运行中恢复已禁用；快照对象/旧 world 无自动回收 |
| 8 | 玩家 | 侧栏玩家 | `PlayersTab` + 指令 | 无单测 | 🟡 在线/白名单/OP/封禁都靠服务器指令，服务器没跑时不可用；在线列表由日志推断 |
| 9 | 联机 | 侧栏联机 | `frp.js` | 手动 frp-e2e | 🟡 通用 frp；樱花穿透仅桌面，网页版已隐藏 |
| 10 | 房间码/邀请 | 实例头「邀请」 | `room.ts`、`InviteDialog` | room 11 例 | 🟡 编解码/过期/深链可靠；网页链接需部署（`VITE_PUBLIC_URL`/当前 origin），桌面不再伪造 404 |
| 11 | 玩家体检/直接启动 | 加入页 | `checkup.ts`、`launch.ts`、`client.js` | checkup 9 + launch 7 + launch-plan 13 | ✅ 默认 `.minecraft` 已修正；直接启动是**离线身份**，正版验证服会失败（界面已说明） |
| 12 | AI 诊断/现场包 | 崩溃卡、配置页 | `crash.ts`、`aidiag.js`、`ai-config.ts` | crash 8 + ai 15 | ✅ 知识库/脱敏/zip/白名单校验 |
| 13 | 跨端同步（Gist） | 设置 | `sync/*` | 13 例（假 Gist） | 🟡 未对真实 `api.github.com` 跑过（需要用户 token） |
| 14 | 多世界 | 世界页 | `mwm.ts` + CLI | 3 例逐字节 | ✅ 5 模板 + 26.1 数据包修复 |
| 15 | 导入既有服务器 | 全部服务器 | `ImportInstanceDialog`、`detectServer` | versions 3 例 | ✅ 标记/特征文件三档；版本已改 Picker，识别不到时手选并阻止空提交 |
| 16 | 设置 | 侧栏设置 | `Settings` | smoke | ✅ 主题/日志上限/动画/同步；日志上限和动画现在**真的生效** |
| 17 | 自动化（重启/公告/备份） | 实例概览 | `schedule.js` + `main.ts` | 6 例 | 🖥️ 仅桌面（网页版已明确提示不会触发）；只调度当前运行实例 |
| 18 | 首次开服向导 | 首次启动 | `FirstRunWizard` | 手动截图 | ✅ 2026-10-30 重做：意图→版本卡（带 Mod/插件数量/Java）→确认；高级项折叠 |
| 19 | 我的服务器 | 玩家导航 | `MyServers` + `Join` 自动保存 | 无 | ✅ 打开房间即保存、同地址去重、删除可撤销 |
| 20 | 我的客户端 | 玩家导航 | `Client.tsx` + `Join` 默认目录 | 无 | ✅ 保存后 Join 会优先用它；不再只是“存在但没人读” |

## 3. 真正验证过的东西

- `pnpm test`：vitest 20 文件（含新增 java/server-guide/server-properties/zh-names）+ node:test（含 download/client/config/preflight/server/serversdat/files/backups/schedule/slp/versions/aidiag）+ parity + download contract。
- 真机：Paper 26.1.2 / Forge 26.1.2 安装、代理目录、打包版首次运行、网页版 agent 端到端、截图探针（黑屏判定）。
- 未验证：NeoForge 真实安装（网络）、真实微软登录、真实 Gist、移动端真机、定时任务跨天。

## 4. 已知空壳/死路（本轮处理）

已修：
- 首次向导“Paper 显示成原版”的文案；禁用按钮不解释；名称空导致下一步灰。
- `?tab=console` 旧链接（Overview 三个快捷入口）。
- `我的服务器` 永远为空（`saveServer` 从未调用）。
- `我的客户端` 保存后 Join 不读。
- 设置里的“日志保留行数 / 界面动画”没有消费方。
- 邀请里的“二维码下一步接”、网页助手“下载地址待配置”占位。
- `jar-missing` 的假“修复”。
- 桌面 `.minecraft` 默认路径算错（`%APPDATA%\wulons-mcss\.minecraft`）。

仍存在：
- `roomWebLink` 的默认 origin 仍是占位域名；UI 已不再用它（有部署地址才发链接）。
- `quickActions` / `accent` / `consoleViewMode` / `detectedJava` / `autoSync` 是配置/同步残骸。
- `Overview` 与 `InstanceOverview` 两套仪表盘信息重叠。
- `wulons-mcss-mwm-mod/` 是独立 Java 子项目，产品代码零引用。
- 文档历史状态（PROJECT/ROADMAP/agent README）仍有旧数字；本轮只修了与用户可见行为相关的段落。

## 5. 文档与代码不一致（需要在下次整理）

| 文档 | 旧说法 | 实际 |
|---|---|---|
| `PROJECT.md` | 129/38 测试、v28 | 现在 144+ vitest / 58+ node / 15 Rust（以 `pnpm test` 为准） |
| `ROADMAP.md` | 阶段 C 未做 | `client:launch` 已实现，真机进程存活验证过 |
| `agent/README.md` | 大量“还没做” | 那些通道都实现了 |
| `docs/FORGE-NEOFORGE.md` | 安装器未做 | 已实现并真机装过 |
| `docs/SERVER-TYPES.md` | 只支持 `java -jar` | argsfile 启动已支持 |
| `docs/ZH-NAMES.md` | 204KB | 实际约 204KB（208,627 字节，5338 条） |
