# Wulon's MCSS · 给 AI Agent 的排查知识库

> 这份文档是写给人机两用的：用户可以把整个目录交给 AI，AI 据此判断问题、给出修复步骤。
> 原则：**先给结论，再给步骤；不要建议删档、重装系统或关闭安全软件。**

## 这个软件是什么

Wulon's MCSS 是本地 Minecraft 服务器管理器（Electron 应用 + 可选的 0.3MB 本地 agent）。
它负责：下载服务端、起停进程、实时日志、玩家/白名单、世界数据包、Mod、备份、内网穿透、邀请链接。

两种运行形态，能力相同：

| 形态 | 说明 |
|---|---|
| Electron | 双击 `WulonsMCSS.exe`，能力经 IPC |
| 网页 + agent | 浏览器打开静态站，能力经 `http://127.0.0.1:28471/api/invoke` + SSE |

## 关键路径

| 东西 | 位置 |
|---|---|
| 配置（实例列表） | 开发：项目根 `config.json`；打包版：`%APPDATA%\wulons-mcss\config.json` |
| agent 令牌 | `%APPDATA%\wulons-mcss\agent.token` |
| 服务端目录 | 每个实例的 `dir` 字段，内有 `server.jar` 或 `fabric-server-launch.jar`、`mods/`、`world/`、`server.properties` |
| 日志 | 界面「控制台」实时输出；服务器自己也写 `logs/latest.log` |
| 备份 | `<服务端目录>/backups/*.zip`，恢复时旧世界留底为 `world.before-restore-*` |
| AI 知识库 | 本目录（`docs/ai/`） |

## 症状 → 原因 → 修法

### 启动瞬间退出，日志有 `UnsupportedClassVersionError`
服务端要求的 Java 比当前新。MC 26.x 需要 Java 21+（实测 25）。
**修**：实例设置 → Java 运行时，选 Java 21 以上。

### `FAILED TO BIND TO PORT` / `Address already in use`
端口被占，通常是同一个服务器开了两份，或其它程序占用。
**修**：先确认没有残留 `java.exe`；改 `server.properties` 的 `server-port` 或实例端口。

### `java.lang.OutOfMemoryError: Java heap space`
堆不够。装了大型 Mod 的服尤其明显。
**修**：调大实例「最大内存」（同时不能超过物理内存的 ~70%，否则会换页更卡）。

### `Failed to load registries` / `Failed to parse wulons:xxx from pack`
自定义维度数据包格式和当前版本不匹配（26.1 改过 schema，需要 `has_ender_dragon_fight`、
`attributes`、显式 `biomes` 数组）。
**修**：实例 →「世界」→「修复数据包」。**不要**手删 `world/datapacks`，会丢维度配置。

### `Missing or unsupported mandatory dependencies` / `Incompatible mod set`
Mod 缺前置或版本冲突。日志里通常有 `requires ... which is missing`。
**修**：按提示补前置；或在「Mod」页禁用可疑项（会改名为 `.jar.disabled`），逐个二分。

### `session.lock` / `world is already in use`
存档被另一个进程锁着。
**修**：确认只有一个服务器进程；结束残留 `java.exe` 后再启动。

### 启动后马上停，日志里没有明显 ERROR
可能是 EULA 未接受、jar 缺失、内存参数非法。
**修**：界面上先点「启动」，看「开服前预检」给出的条目；预检全绿还失败再看日志最后 30 行。

### 玩家连不上，但服务器在跑
1. 本机自连 `127.0.0.1:端口` 测试；
2. 同一 WiFi 用内网 IP；
3. 外网需要 FRP 隧道，确认隧道地址与端口映射；
4. 正版验证：`online-mode=true` 时客户端必须正版登录。

## 排错纪律（给 AI 的约束）

- 先复述**症状**与**证据**（哪一行日志），再给结论；
- 修复动作必须是**可逆**的：改名而不是删除，备份后再改；
- 不要建议关闭防火墙 / 用盗版 / 删 `world`；
- 如果证据不足，明确说“需要哪一段日志”，不要猜。
