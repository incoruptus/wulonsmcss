# v28 发布 / 部署清单

> 仓库还没建，所以这里只列步骤，不写死任何地址或平台。

## 1. 建仓库后先填三处

| 文件 / 环境 | 变量 | 说明 |
|---|---|---|
| `src/renderer/lib/links.ts` 或构建环境 | `REPO` / `VITE_REPO` | 项目主页、agent 下载、release 资产都从这里推导 |
| `src/renderer/lib/links.ts` 或构建环境 | `AUTHOR_URL` / `VITE_AUTHOR_URL` | 设置页「作者主页」按钮 |
| 构建环境 | `VITE_PUBLIC_URL` | 网页版公开地址，用于「一键进服」链接；不填则网页版只发房间码 |

填完后：

```bash
cp .env.example .env.local   # 按需填写，Windows 可直接新建
pnpm typecheck && pnpm test
```

设置页的「作者主页 / 项目主页」按钮会自动出现，网页版「下载助手」不再为空。

## 2. 版本

```bash
# package.json → 28.0.0
pnpm build && pnpm build:web
node scripts/check-release.cjs --package
```

`check-release` 会核对版本、build-info、包内功能标记和第三方许可证。

## 3. Agent 资产

```bash
pnpm release:agent
```

产物在 `release/`（脚本会打 zip + SHA256）。上传到 GitHub Release 的 `latest`，资源名保持 `mcss-agent-win64.zip`，不要带版本号。

## 4. 网页版部署

`pnpm build:web` 输出 `dist-web/`，是纯静态站点，HashRouter 不需要服务器 rewrite。

部署平台任选，关键是：

- 设置 `VITE_PUBLIC_URL=https://你的域名/子路径` 后再构建
- 开启 HTTPS（房间码/剪贴板/公网探测都需要安全上下文）
- 静态资源缓存带 hash，`index.html` 不缓存

## 5. 桌面版

```bash
node package-win.js
```

产物：`wulons-mcss-b28.0.0/WulonsMCSS-win32-x64/`。打包前先退出正在运行的 `WulonsMCSS`，否则单实例锁会让旧进程占住文件。

## 6. CI

`.github/workflows/ci.yml` 已就绪：push / PR 会跑 typecheck、202 vitest、72 node:test、20 Rust、parity、download contract、桌面构建、网页构建与 release check。

## 7. push 前最后一遍

- [ ] `REPO` / `AUTHOR_URL` 已填真实值
- [ ] 没有 `config.json.bak`、截图、`copy-apply-report.json` 入库
- [ ] `pnpm test` 全绿
- [ ] `node scripts/check-release.cjs --package` 全绿
- [ ] 设置页头像/主页按钮在桌面版和网页版都正常
- [ ] 网页版在一台没装过 agent 的机器上能走完「下载助手」链路
