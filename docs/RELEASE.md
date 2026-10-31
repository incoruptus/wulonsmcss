# 发布清单

> 一条命令能验的，就不要靠记忆。这里每一行都对应一个脚本或一次点击。

## 1. 本地自检

```bash
pnpm test          # 116 vitest + 24 node:test + 能力一致性 + 下载契约
pnpm typecheck     # tsc --noEmit
pnpm build         # 桌面版三端
pnpm build:web     # 静态网页 → dist-web/
pnpm release:check # 网页产物：挂载点、相对路径、JS 是否齐全
```

### 界面自检（黑屏回归）

```bash
node scripts/ui-probe.cjs --route "#/settings"                    # 逐页打开，截图 + 抓文本
node scripts/ui-probe.cjs --click "[aria-label='新建实例']" --delay 12000
node scripts/ui-probe.cjs --route "#/join" --expect "加入房间"    # 断言某段文字在
```

探针判定「页面文本长度 < 20」即为黑屏/白屏，退出码非 0，可直接串进发布前检查。
黑屏时先看 `%APPDATA%\wulons-mcss\renderer.log`：渲染进程的 console.error、
未捕获异常、`render-process-gone` 都会记在里面。

## 2. 出包

```bash
node package-win.js
pnpm release:check --package   # 版本一致 / build-info / agent 在 / asar 含新功能
```

包检查会顺带核对 asar 里有没有这几个字符串——**防止“打了包但打的是旧代码”**：

- `时间机`、`同 WiFi 直连`、`AI 配置助手`、`你的客户端可以直接进`

## 3. agent 资产

```bash
pnpm release:agent
# → release/mcss-agent-<version>-setup.exe
# → release/mcss-agent-<version>-win64.zip（便携版）
# → SHA256SUMS.txt
```

上传到 GitHub Release 后，网页按钮指向：

```
<repo>/releases/latest/download/mcss-agent-setup.exe
```

`make-release.cjs` 会产出带版本号的安装包，以及不带版本号的稳定名 `mcss-agent-setup.exe`。**两个都要上传**——网页用的是稳定名，否则每次发版链接都会失效。便携版 zip 可以一起传，给不想安装的人用。

还有一步别忘了：把真实仓库填进 `src/renderer/lib/links.ts` 的 `REPO`
（或构建时给 `VITE_AGENT_DOWNLOAD_URL`）。没填时网页上的按钮会显示
「助手下载地址待配置」并且不可点——**宁可不给入口，也不给假入口**。

## 4. 首次建仓库（11 月 1 日）

```bash
git remote add origin <repo>
git push -u origin master
```

然后仓库 Settings → Pages → Source 选 **GitHub Actions**。
`.github/workflows/pages.yml` 会在 push 时跑：typecheck → test → build:web → 产物自检 → 发布。

需要确认：

- `pnpm-lock.yaml` 已提交（CI 用 `--frozen-lockfile`）
- 页面用相对路径 + Hash 路由，挂 `/<repo>/` 子目录也能跑

## 5. 发布后抽检（别只看 CI 绿）

| 检查 | 怎么做 |
|---|---|
| 页面能开 | 打开 Pages 地址，看到「加入房间」而不是白屏 |
| 助手能配 | 下载 agent → 双击 → 网页显示已连接 |
| 房间能解析 | 用一个真实房间码走一遍 |
| 收不到请求 | 浏览器控制台看 `/api/health` 是否 200 |

## 已知未验证项

- **真实游戏启动**：`client:launch` 的 spawn 链路验过（真起进程、真执行命令），
  但没装过完整客户端，所以「游戏窗口真的起来并进服」还没跑过
- **真实 api.github.com**：同步逻辑用假 Gist 服务跑通，没对线上 GitHub 验证
