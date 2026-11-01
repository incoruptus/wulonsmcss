# 建仓库后的 6 步

> 本地已经验证完；仓库建好后只要替换地址、推送、上传 Release 资产。
> 不要把 `.env.local`、`config.json`、`node_modules`、`release/` 里的二进制提交进仓库。

## 1. 建空仓库

在 GitHub 建一个空仓库，例如 `owner/wulons-mcss`，不要勾选自动生成 README。

## 2. 填本地配置

复制 `.env.example` 为 `.env.local`：

```dotenv
VITE_REPO=incoruptus/wulonsmcss
VITE_AUTHOR_URL=https://github.com/incoruptus
VITE_PUBLIC_URL=https://incoruptus.github.io/wulonsmcss
```

`VITE_PUBLIC_URL` 还没部署时留空，邀请会退回房间码，不会生成坏链接。

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

Agent 安装包在：

```text
release\mcss-agent-28.0.0-setup.exe
release\mcss-agent-setup.exe
```

便携版 zip：

```text
release\mcss-agent-28.0.0-win64.zip
release\mcss-agent-win64.zip
```

安装包的稳定名 `mcss-agent-setup.exe` 是网页按钮用的地址；便携版可以一起传，给不想安装的人用。

当前校验值：

```text
WulonsMCSS.exe
228E08C6AAE7A0B149E7D9EFBF931620405BC9DC52228E269D7CEA3088B1FE2D

WulonsMCSS-28.0.0-win64.zip
81bd0591b07896f255e3bd917af7fa1ec7d7c0a8577e5515b88f252b941c3d58

mcss-agent-28.0.0-setup.exe
517d4914a636286368218c2e047b57a99062af686f6d9008f4e3ecefed21f01d

mcss-agent-28.0.0-win64.zip
43580e962d6cf5b4bd7a847eabf1f5adc7c7810a8cfc6bc0caf68e7dc6960e84
```

## 6. 部署网页版

网页版构建：

```powershell
pnpm build:web
```

构建产物在 `dist-web/`，按 [DEPLOY.md](./DEPLOY.md) 部署到静态托管。部署后把真实地址填回 `VITE_PUBLIC_URL` 并重新构建，否则邀请链接不会指向网页版。

## 推送前最后确认

- `git status` 干净
- 211 vitest + 72 node:test + 20 Rust 全过
- release check 42/42
- `.env.local` 已被 `.gitignore` 忽略
- `config.json` 没有进提交
