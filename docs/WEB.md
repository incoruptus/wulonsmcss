# 网页版 · 静态站点 + 本地助手

> 目标：**用户不用装 190MB 的 Electron，也能开服、也能一键进服。**

## 三块拼图

```
┌─────────────────┐   HTTPS（GitHub Pages）   ┌──────────────────┐
│  浏览器里的 UI   │ ◄───────────────────────► │  dist-web（静态）  │
└────────┬────────┘                            └──────────────────┘
         │ HTTP/SSE → 127.0.0.1:28471
┌────────▼────────┐
│  mcss-agent     │  1.0 MB 单文件，零依赖，后台运行
│  （本机助手）     │  管进程 / 读写文件 / 起 Java
└─────────────────┘
```

网页负责界面与编排，助手只做浏览器做不到的事。两者用**和 Electron 完全相同的 channel 契约**通信，
所以 `src/renderer` 一行代码不用分叉。

## 当前能力对照

| 能力 | 桌面版 | 网页版（+ agent） |
|---|---|---|
| 开服 / 停服 / 控制台 / 命令 | ✅ | ✅ |
| 加入房间 / 准备客户端 / 进服包 | ✅ | ✅ |
| 世界备份与恢复 | ✅ | ✅ |
| Mod 扫描 / 禁用 / 资源库安装 | ✅ | ✅ |
| 资源库中文名 / 中文简介 / 详情 / 标签筛选 | ✅ | ✅ |
| 日志右键翻译（自定义右键菜单） | ✅ | ❌ 用浏览器自带菜单（故意） |
| AI 现场包 | ✅ | ✅ |
| 启动器探测与打开 | ✅ | ✅ |
| 新建实例 / 下载服务端 | ✅ | ✅ |
| 内网穿透（FRP） | ✅ | ✅ |
| 多世界数据包生成 | ✅ | ✅ |
| 世界快照（时间机） | ✅ | ✅ |
| 开服前预检（7 项） | ✅ | ✅ |
| Java 探测 / 目录与文件选择（网页版页面内） | ✅ | ✅ |
| 自动安装 Java（下载 JDK） | ❌ 未做 | ❌ 未做 |

**能力一致性由脚本守着**：`node scripts/check-parity.cjs` 会比对 preload 暴露的
全部通道与 agent 已实现的通道，`pnpm test` 里带 `--strict`——少了任何一条，测试直接红。
网页版的目录与保存入口统一走 `pickPath()`，源码里除 `path-picker.ts` 外再出现
`window.mcss.dialog.` 会被 `check-release` 直接拦下。

网页版遇到确实不支持的通道时，会显示「这个功能需要桌面版」而不是内部错误名
（agent 返回 `UNSUPPORTED:<channel>`，`httpClient` 负责翻译）。

## 开发

```bash
pnpm build:web                 # 静态构建 → dist-web/
cargo build --release --manifest-path agent/Cargo.toml
MCSS_CONFIG=./config.json ./agent/target/release/mcss-agent.exe
node scripts/web-shot.cjs      # 起 agent + 静态站点 + 截图验证
```

## 部署到 GitHub Pages

`.github/workflows/pages.yml` 会在 push 到 `master/main` 时自动构建并发布 `dist-web`。
仓库 Settings → Pages → Source 选 **GitHub Actions** 即可。

页面用的是**相对路径 + Hash 路由**，挂在任意子目录（如 `/mcss/`）都能跑，不需要服务端重写规则。

## 配对

1. 助手首次运行生成 32 位令牌，写到 `%APPDATA%/wulons-mcss/agent.token`
2. 网页第一次打开时没有令牌，会向本机助手的 `POST /api/pair` 换一个，存进 localStorage
3. 之后每个请求带 `x-mcss-token`；令牌失效时（例如删了 `agent.token`），下一次调用会自动重新配对
4. 助手也注册了 `mcss://` 协议；网页点「用助手打开」→ `mcss://join/<房间码>` → 助手拼出
   `网页/#/join/<码>?t=<令牌>` 并打开浏览器

没令牌的普通请求一律 401，只有 `/api/pair` 例外；跨域预检带了
`Access-Control-Allow-Private-Network`，满足 Chrome 对「公网页面访问本机」的要求。

`Origin` 做白名单：本机页面（127.0.0.1/localhost/::1）和
`https://incoruptus.github.io` 直接可用；自定义部署地址需要给助手设置
`MCSS_ALLOWED_ORIGINS=https://your.site`（逗号分隔）。
非白名单来源直接 403，`/api/pair` 也一样。

## 安全边界

- 助手只监听 `127.0.0.1`，不对外网开放
- 令牌与来源白名单一起使用：白名单决定「谁能开口」，令牌决定「口令对不对」
- 房间码自带校验位，篡改/过期会直接报错；内容不经过我们的服务器
- 助手能做的仅限「配置/文件/进程」三组 channel；`fs:*` 仍是本机文件能力，配对时要当密码对待
