# v28.0.0 发布说明

> 2026-10-31 · 一个“把 v27 收干净”的大版本，不堆新功能，补发布、维护、翻译三件事。

## 主要变化

- **文案整体升级**：按《文案优化稿》回填 522 处，用户可见片段按上下文合并；技术性提示保留原样。
- **关于页**：去掉“特别感谢”与数据来源署名；作者头像改为隐刻INCO 圆形头像；作者/项目主页按钮按配置显示。
- **i18n 框架**：`I18nProvider` / `useI18n` / 词典回退 / `mcss.locale` 持久化已就绪；页面迁移与语言入口下一轮。
- **多世界版本门禁**：1.16.2 以下提示原版不支持；1.16.2–26.0 提示当前生成器只支持 26.1 格式；未知版本禁用生成，避免写出起不来的数据包。
- **项目清查**：v28 审计、链接/占位清单、CI、部署清单。
- **发布链路**：GitHub Actions（typecheck / vitest / node:test / Rust / parity / 桌面构建 / 网页构建 / release check）；`release:agent` 产出 v28 助手 zip 与 SHA256。

## 验证

- 206 vitest + 72 node:test + 20 Rust 全过
- parity 100%
- `release:check --package` 37/37
- 包：`wulons-mcss-b28.0.0/WulonsMCSS-win32-x64/WulonsMCSS.exe`（约 272.9 MB）
- 助手：`release/mcss-agent-28.0.0-win64.zip` + `mcss-agent-win64.zip`
  - SHA256 `294cd9aff47dde7df72f859a6833b808b6c52b52452cf313955732534cb6d336`

## 已知事项

- `REPO` / `AUTHOR_URL` 仍为空：仓库建好后填 `src/renderer/lib/links.ts`，项目主页、作者主页、网页版“下载助手”才会出现。
- i18n 只有框架，页面仍是中文；英文词典为空时回退中文。
- 19 条 §5.2 技术性片段（AI 提示、进程信号、路由器错误、MWM 数据包说明等）保留原文，避免破坏协议/日志语义。
- 部署前需要设置 `VITE_PUBLIC_URL`；网页版为纯静态 `dist-web/`，HashRouter 不需要 rewrite。
