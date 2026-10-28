# mcss-agent · 本地助手

把 Electron 主进程的核心能力用最小体积重写，让**静态网页**也能开服。

- 零第三方依赖（只用标准库：TCP、进程、线程）
- 单文件二进制约 **0.3 MB**（`opt-level=z` + LTO + strip）
- 契约与 Electron preload 完全一致：`POST /api/invoke {channel, args}`，事件走 SSE

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
`server:start|stop|command|status|pid|memory`

事件：`server:output`（含时间戳/级别/正文）、`server:status`。

## 还没做

- `versions:*` / `modrinth:*` / `worlds:*` / `mods:*` / `frp:*`（网页版暂时用不到）
- 配对令牌的生成与 `mcss://` 协议注册（下一步）
- Windows 防火墙提示与开机自启
