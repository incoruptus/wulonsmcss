# v28 零基础可用性走查记录

> 目标：让没玩过 MC、玩过但不会联机、想开服不会配置、想和朋友玩旧存档、被朋友叫来但没接触过 MC 的人，都能在主路径上知道「现在是什么、下一步做什么」。
>
> 原则见 [UX-CONTRACT.md](./UX-CONTRACT.md)。

## 1. 五类目标用户

| 用户 | 入口 | 已提供的路径 |
|---|---|---|
| 没玩过 MC | 加入游戏 | 首次说明：安装 Java 版、拿邀请、回来粘贴；进服包/版本检查 |
| 玩过但不会联机 | 联机 / 总览 | 「让朋友进来」：先检查，再给直连地址或中转线路；地址可复制 |
| 想开服不会配置 | 首次启动 / 新建服务器 | 三次选择；「不知道怎么选？」+ 推荐配置；预检给修复按钮 |
| 想和朋友玩旧存档 | 用现有客户端开服 | 扫描 `.minecraft/saves`，自动复制成服务端 `world`，原存档保留 |
| 被朋友叫来但没接触过 MC | 加入游戏 | 第一次玩说明、客户端检查、进服包、缺版本/缺模组时给下一步 |

## 2. 截图证据

| 页面 / 状态 | 截图 |
|---|---|
| 联机：下一步 + 直连地址 + 技术详情折叠 | `./screenshots/network.png` |
| 新建服务器：不知道怎么选 + 推荐配置 | `./screenshots/create-server.png` |
| 加入游戏：首次玩 MC 说明 | `./screenshots/join.png` |
| 配置：这里改什么 | `./screenshots/config.png` |
| 内容：管理什么、何时生效 | `./screenshots/content.png` |
| 模组：检查模组是否齐全 | `./screenshots/mods.png` |
| 控制台空状态 | `./screenshots/console-empty.png` |
| AI 配置：三步用法 | `./screenshots/ai-config.png` |
| 客户端空目录 + 选择按钮 | `./screenshots/client-empty.png` |
| 世界/备份：先选对备份方式 | `./screenshots/worlds.png` |
| 设置：运行与外观 | `./screenshots/settings.png` |

## 3. 空态 / 错误态

| 场景 | 状态 | 下一步 |
|---|---|---|
| 没有服务器 | 总览空态 | 新建服务器 |
| 控制台没日志 | 空态 | 启动服务器 |
| 世界没有数据包 | 空态 | 新建第一个世界 |
| 没有备份/快照 | 空态 | 导出一份 / 打个快照 |
| 搜索无结果 | 空态 | 清空搜索 |
| 玩家列表为空 | 空态 | 去联机页拿地址 / 启动服务器 |
| 客户端目录不对 | 空态 | 选择 .minecraft 目录 |
| AI 回复没有配置 | 错误态 | 整段重新粘贴 / 让 AI 重来 |
| 服务端缺启动文件 | 预检错误 | 重新安装服务端 / 新建 |
| 诊断码损坏 | 错误态 | 让朋友重新复制诊断 |
| 诊断出缺模组/缺版本 | 结果态 | 进服包 / 换版本 / 去联机页 |

## 4. 验证

- `pnpm typecheck`：通过
- `pnpm test`：**211 vitest + 72 node:test**，parity 100%
- `cargo test`：**20 Rust** 全过
- `pnpm build` / `pnpm build:web`：通过
- `node scripts/web-e2e.cjs`：**24/24**
- `node scripts/check-release.cjs --package`：**37/37**
- 桌面包：`D:\Games\Minecraft\MCServer\wulons-mcss-b28.0.0\WulonsMCSS-win32-x64\WulonsMCSS.exe`（约 273 MB）
  - SHA256 `F12EBC300DD9C95EF4B711716561FFCFA20E8DC28E505BC7E98BA3AFC5E42BC8`
- Agent 发布包：`release\mcss-agent-28.0.0-win64.zip` / `release\mcss-agent-win64.zip`
  - SHA256 `c766486824b0ea2f91cb661ec32f7c76af01b858692c631fae2fa68a0e459cf2`

## 5. 非阻塞事项

- **i18n 页面迁移**：框架（Provider / `t()` / 回退 / 持久化）已就绪，页面文案仍以中文为主；按当前目标不作为阻塞项。
- **仓库与公开地址**：`REPO` / `AUTHOR_URL` / `VITE_PUBLIC_URL` 仍为空，push/deploy 与作者/项目主页按钮需要真实地址。
- **技术详情**：NAT、IPv6、UPnP、STUN 等只保留在折叠区，给需要排障的人；主路径不依赖这些词。
