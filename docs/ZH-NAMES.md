# Mod 中文名与中文简介：数据从哪来

> 目标：资源库里能像 PCL 那样看到「中文名 + 英文名 + 标签 + 版本 + 简介」，
> 但**不编造**任何一条中文名。

## 1. 中文名

Modrinth 官方 API 只有英文 `title`，没有本地化字段。PCL2 的做法也不是硬编码，
而是随包带了一份由 **MC 百科（mcmod.cn）** 条目整理出来的对照表
（`PCLCS/Resource/WikiEntries.txt`，约 946KB，`slug|中文名` 的纯文本）。

我们只取其中 **Modrinth slug → 中文名** 一列，生成
`src/renderer/assets/zh-names.json`（当前 **5338** 条，约 204KB）：

```bash
# 从 jsDelivr 拉 PCL 的最新表并重新生成
node scripts/build-zh-names.cjs

# 或者用本地已经下载好的 WikiEntries.txt（离线/审阅）
node scripts/build-zh-names.cjs --from path/to/WikiEntries.txt
```

规则（见 `scripts/build-zh-names.cjs` 与 `src/renderer/lib/zh-names.ts`）：

- `@slug` = 仅 Modrinth；`slug@` = 两个平台同 slug；`cf@mr` = 分平台；`slug` = 仅 CurseForge。
- 去掉 PCL 的 `*` 占位符，去掉「(English Name)」尾巴。
- 没有中文名的项目**保留英文标题**，界面上不会出现拼音/机翻假名。
- 同一个 slug 出现多次时保留第一条（MC 百科浏览量高的在前）。

**署名**：中文名数据来自 MC 百科（mcmod.cn），经 PCL 整理。我们只做格式转换，
不改写译名；应用「设置 → 关于」里也标了来源。若某条译名有误，应回到 MC 百科修正。

### 中文名反查

资源库搜索框输入中文时（`zhSearchSlugs`），先按中文名找到 slug，再用 slug 查
Modrinth；命中结果打「中文名」标。反查**不带版本/加载器 facet**，因为要先把项目找出来：
如果它没有当前实例的版本，就显示「不适配」而不是假装它不存在。

## 2. 中文简介

Modrinth 项目的 `description` 也是英文。中文简介来自 **MCIM** 的机翻接口：

```
GET https://mod.mcimirror.top/translate/modrinth?project_id=<id>
```

- 只在**打开详情**时请求（不在列表里批量翻），主进程缓存 6 小时。
- 没有译文时直接显示英文原文，不报错。
- 列表里的那句英文简介保持原文——PCL 也是这么做的；机器翻译的长句在列表里反而更难扫。

## 3. 任意文本机翻

桌面版日志/文本的右键菜单里可以「翻译这一行 / 翻译选中」：

- 主进程 `translate:text`：MyMemory 为主（国内可达），Google 兜底；按行切块，单次最多 3000 字。
- 网页版**不接管右键**：Edge/Chrome 自带的「翻译选中 / 搜索 / 阅读模式」更全，
  用户也可能装了划词工具；我们只在桌面版补这块。

## 4. 更新频率

中文名表是「快照」，不会自动更新。MC 百科新增条目后重新跑一次生成脚本即可；
这是有意的：启动时拉 946KB 文本既慢又没必要。
