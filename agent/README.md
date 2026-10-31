# mcss-agent · 本地助手

把 Electron 主进程的核心能力用最小体积重写，让**静态网页**也能开服。

- 零第三方依赖（只用标准库：TCP、进程、线程）
- 单文件二进制约 **0.3 MB**（`opt-level=z` + LTO + strip）
- 契约与 Electron preload 完全一致：`POST /api/invoke {channel, args}`，事件走 SSE

## 安装版（Windows）

从 Release 下载 `mcss-agent-setup.exe`，双击安装即可。安装到当前用户目录，不需要管理员权限：

- 默认路径：`%LOCALAPPDATA%\Programs\Wulons MCSS Agent`
- 开始菜单快捷方式：「Wulon's MCSS 助手」
- 可选「开机自动启动助手」
- 卸载走 Windows「应用和功能」，会一并移除自启动项

便携版 `mcss-agent-win64.zip` 仍然保留，解压后直接运行 `mcss-agent.exe`。

## 跑起来

```bash
cargo build --release
MCSS_CONFIG=../config.json ./target/release/mcss-agent.exe
# 监听 http://127.0.0.1:28471
```

环境变量：

| 变量 | 作用 | 默认 |
|---|---|---|
| `MCSS_PORT` | 监听端口 | `28471` |
| `MCSS_TOKEN` | 配对令牌（缺省时自动生成并存到 `%APPDATA%/wulons-mcss/agent.token`） | 自动生成 |
| `MCSS_CONFIG` | 配置路径 | `./config.json` 或 `%APPDATA%/wulons-mcss/config.json` |
| `MCSS_WEB_BASE` | 深链打开的网页地址 | `https://wulons.github.io/mcss` |
| `MCSS_NO_OPEN` | 设置后只打印深链、不打开浏览器（测试用） | — |

## 配对与深链

- 首次运行自动生成 32 位令牌，写入 `%APPDATA%/wulons-mcss/agent.token`
- 同时注册 `mcss://` 协议（`HKCU\Software\Classes\mcss`，当前用户，无需管理员）
- 被 `mcss://join/<房间码>` 唤起时，会拼出 `网页/#/join/<码>?t=<令牌>` 并打开浏览器

```bash
MCSS_NO_OPEN=1 ./mcss-agent.exe --join "mcss://join/w1z.abc.def"
# 打开：https://wulons.github.io/mcss/#/join/w1z.abc.def?t=<token>
```

## 验证

```bash
node scripts/web-e2e.cjs   # 7 项契约校验：健康/令牌/配置/状态/未知通道/SSE
```

`app:info` · `app:lan-address` · `config:read|write` · `fs:read|write|exists|list|mkdir` ·
`server:start|stop|command|status|pid|memory` ·
`client:add-server` · `client:prepare` · `client:export-mrpack` ·
`backup:list` · `backup:create` · `backup:restore` · `backup:remove` ·
`modrinth:search` · `modrinth:versions` · `modrinth:install` ·
`mods:scan` · `mods:meta` · `mods:disable` · `mods:enable` ·
`app:detect-launchers` · `ai:export-bundle`

事件：`server:output`（含时间戳/级别/正文）、`server:status`、`client:progress`。

### Mod 通道

`mods:scan` 用 `bsdtar -xOf <jar> fabric.mod.json` 读元数据（zip + deflate 交给它），
25 个 jar 约 0.6 秒；读不到就退回文件名解析（`name-1.2.3.jar`）。
`mods:disable` / `mods:enable` 只是改名，和桌面版行为一致。

### 备份

| channel | 说明 |
|---|---|
| `backup:create` | `tar -a` 打包 `world/` → `backups/world-YYYYMMDD-HHMMSS.zip` |
| `backup:list` | 按时间倒序列出，含大小 |
| `backup:restore` | 要求服务器已停止；先改名留底 `world.before-restore-*`，失败自动回滚 |
| `backup:remove` | 拒绝路径穿越，只接受 `*.zip` 文件名 |

### 客户端通道（网页版也能「一键进服」）

| channel | 说明 |
|---|---|
| `client:scan` | 读 `versions/*/*.json` + `mods/`，返回客户端版本/加载器/Mod（不改文件） |
| `client:add-server` | 写 `servers.dat`（自写 NBT，**先读后写，不覆盖已有列表**） |
| `client:prepare` | 按 Modrinth 版本 id 下载 Mod 到 `mods/` |
| `client:export-mrpack` | 导出 `.mrpack`（含 `overrides/servers.dat`），任何启动器可导入 |

下载走系统 `curl`、打包走 `bsdtar` —— 仍然零第三方依赖。

## 还没做

- 自动下载/安装 Java（只做探测与“去哪儿下载”的指引）
- 微软账号登录（客户端启动仍是离线身份）
- NeoForge 新建（已按产品决定暂停，仅支持导入已有目录）；真实 Gist / 移动端等环境性验证（见 `docs/REVIEW-2026-10-30.md`）
- Windows 防火墙提示与开机自启

> `versions:*`、`modrinth:*`、`worlds:*`、`mods:*`、`frp:*`、`backup:*`、`ai:export-bundle`
> 已经在 agent 里实现（包括 26.x 的 argsfile 启动、资源库中文简介/机翻）。旧版本文档的
> “还没做”清单已过期，以 `scripts/check-parity.cjs` 的 100% 与 `scripts/web-e2e.cjs` 为准。
