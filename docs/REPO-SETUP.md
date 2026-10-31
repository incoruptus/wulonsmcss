# 建仓库后的 6 步

> 本地已经验证完；仓库建好后只要替换地址、推送、上传 Release 资产。
> 不要把 `.env.local`、`config.json`、`node_modules`、`release/` 里的二进制提交进仓库。

## 1. 建空仓库

在 GitHub 建一个空仓库，例如 `owner/wulons-mcss`，不要勾选自动生成 README。

## 2. 填本地配置

复制 `.env.example` 为 `.env.local`：

```dotenv
VITE_REPO=owner/wulons-mcss
VITE_AUTHOR_URL=https://你的作者主页
VITE_PUBLIC_URL=https://你的网页版地址
```

只填已知项；`VITE_PUBLIC_URL` 还没部署时留空，邀请会退回房间码，不会生成坏链接。

## 3. 检查与提交

```powershell
git status
pnpm typecheck
pnpm test
node scripts/check-release.cjs --package
```

确认 `config.json` 没有被改动、`_probe*.png` 和 `config.json.bak` 没有进版本库。

## 4. 推送

```powershell
git remote add origin https://github.com/owner/wulons-mcss.git
git branch -M main
git push -u origin main
git tag v28.0.0
git push origin v28.0.0
```

## 5. 上传 Release 资产

桌面包在仓库外，已打成可直接上传的 zip：

```text
release\WulonsMCSS-28.0.0-win64.zip
```

原始目录：

```text
D:\Games\Minecraft\MCServer\wulons-mcss-b28.0.0\WulonsMCSS-win32-x64\
```

Agent 包在：

```text
release\mcss-agent-28.0.0-win64.zip
release\mcss-agent-win64.zip
```

两个 Agent 名字都要传；网页按钮指向稳定名 `mcss-agent-win64.zip`。

当前校验值：

```text
WulonsMCSS.exe
F12EBC300DD9C95EF4B711716561FFCFA20E8DC28E505BC7E98BA3AFC5E42BC8

WulonsMCSS-28.0.0-win64.zip
8E60719A1F6B3381BC3AC5D79F793EEF9DEFC51B65B071FBA67BD8D601A44C49

mcss-agent-28.0.0-win64.zip
c766486824b0ea2f91cb661ec32f7c76af01b858692c631fae2fa68a0e459cf2
```

## 6. 部署网页版

网页版构建：

```powershell
pnpm build:web
```

构建产物在 `out-web/`，按 [DEPLOY.md](./DEPLOY.md) 部署到静态托管。部署后把真实地址填回 `VITE_PUBLIC_URL` 并重新构建，否则邀请链接不会指向网页版。

## 推送前最后确认

- `git status` 干净
- 208 vitest + 72 node:test + 20 Rust 全过
- release check 37/37
- `.env.local` 已被 `.gitignore` 忽略
- `config.json` 没有进提交
