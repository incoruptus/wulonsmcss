# 网页版 · 静态站点 + 本地助手

> 目标：**用户不用装 190MB 的 Electron，也能开服、也能一键进服。**

## 三块拼图

```
┌─────────────────┐   HTTPS（GitHub Pages）   ┌──────────────────┐
│  浏览器里的 UI   │ ◄───────────────────────► │  dist-web（静态）  │
└────────┬────────┘                            └──────────────────┘
         │ HTTP/SSE → 127.0.0.1:28471
┌────────▼────────┐
│  mcss-agent     │  0.3 MB 单文件，零依赖
│  （本机助手）     │  管进程 / 读写文件 / 起 Java
└─────────────────┘
```

网页负责界面与编排，助手只做浏览器做不到的事。两者用**和 Electron 完全相同的 channel 契约**通信，
所以 `src/renderer` 一行代码不用分叉。

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
2. 助手注册 `mcss://` 协议；网页点「用助手打开」→ `mcss://join/<房间码>` → 助手拼出
   `网页/#/join/<码>?t=<令牌>` 并打开浏览器
3. 网页把令牌存 localStorage，之后请求带 `x-mcss-token`

没令牌的请求一律 401；跨域预检带了 `Access-Control-Allow-Private-Network`，
满足 Chrome 对「公网页面访问本机」的要求。

## 安全边界

- 助手只监听 `127.0.0.1`，不对外网开放
- 令牌是唯一凭据，等价于本机密码；泄露了就在 `agent.token` 里换一个
- 房间码自带校验位，篡改/过期会直接报错；内容不经过我们的服务器
- 助手能做的仅限「配置/文件/进程」三组 channel，没有远程执行任意命令的入口
