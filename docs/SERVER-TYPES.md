# Minecraft 服务端谱系（调研结论）

> 结论先行：**"开服"不是一个动作，而是五种不同的世界**。
> 插件服与模组服决定了「玩家要不要装东西」，也就决定了我们整条玩家链路怎么走。
> 现在的实现只有 vanilla / fabric 两条，等于把最主流的那条（水桶服）漏掉了。

调研时间：2026-10-29。以下 API 端点均已实测可访问（除标注"未验证"的）。

---

## 1. 五种服务端

### A. 原版（Vanilla）
- 就是 Mojang 官方 `server.jar`。
- 无插件、无模组；只要有新版本就会跟进。
- 客户端：原版即可。
- 用途：纯净生存、红石/原版机器服、给不装任何东西的朋友玩。

### B. 插件服（Bukkit 系，中文常叫"水桶服"）
血统：CraftBukkit → **Spigot** → **Paper** → Purpur / Folia。

| 软件 | 定位 | 现状（2026） |
|---|---|---|
| CraftBukkit | 老祖宗 | 法律纠纷后基本淘汰 |
| Spigot | 老牌分支 | 仍可用，但更新慢、性能落后 |
| **Paper** | **事实标准** | 几乎所有插件作者以 Paper 为准；性能、配置项、更新速度都最好 |
| **Purpur** | Paper 的上层增强 | 兼容 Paper 插件，额外几百个玩法开关（`purpur.yml`） |
| Folia | 多线程实验分支 | 插件兼容性差，普通服主不该碰 |

- **插件只跑在服务端**，玩家用原版客户端直接进 —— 这是它最大的价值。
- 内容目录是 `plugins/`，不是 `mods/`。Paper 会**完全忽略** `mods/`。
- 现实：国内绝大多数"生存服 / 小游戏服 / 带地皮保护的服"都是 Paper。

### C. 模组服（Loader 系）
| 加载器 | 时代 | 说明 |
|---|---|---|
| **Fabric** | 1.14+ | 轻量、更新最快；性能模组（Lithium / FerriteCore / Krypton）首选 |
| **NeoForge** | 1.20.2+ | 2023 年从 Forge 分裂；**现代整合包的标准**，新科技/魔法模组基本只在这里 |
| **Forge** | 1.12.2–1.19.2 为主 | 老整合包只能跑 Forge；2026 仍在维护 26.x 线（promotions 里有 62–66 系） |
| Quilt | — | Fabric 的分支，生态小；优先级最低 |

- 内容目录是 `mods/`，**客户端必须装同一套模组**（否则进不去）。
- 判断"用哪个"的唯一可靠依据：**整合包作者写的是哪个**。

### D. 混合服（插件 + 模组）
Mohist / Arclight / Cardboard 之类，试图让 Bukkit 插件跑在 Forge/NeoForge 上。

- 社区共识（也是我们该采纳的立场）：**不稳定、bug 诡异、出问题基本没人救**。
- 但需求真实存在（"既要地皮插件又要 Create 模组"）。
- 我们的策略：**不做安装入口**；如果导入的目录被识别为混合服，明确标注 + 风险提示 + 建议二选一。

### E. 代理 / 群组服
Velocity（PaperMC）、BungeeCord（SpigotMC）、Waterfall（已边缘化）。

- 一个对外地址后面挂多个子服（登录服 / 生存服 / 小游戏）。
- 对我们是"进阶功能"：服主玩到一定规模才会需要，但它是社区服的常见终态。
- 技术代价高：转发模式、正版验证统一、子服握手，都要配对。

### F. 基岩互通（Geyser + Floodgate）
- 作为插件（Paper/Purpur）或模组（Fabric/NeoForge）安装。
- 让手机/平板/主机版玩家进 Java 服 —— 在中国玩家基数下，这是**最容易被低估的一个功能**。

---

## 2. 技术参数（可直接照做）

### 下载源

| 类型 | 清单 API | 产物 | 校验 |
|---|---|---|---|
| vanilla | `piston-meta.mojang.com/mc/game/version_manifest_v2.json` → 版本 json 的 `downloads.server` | `server.jar` | sha1 |
| Paper | `https://fill.papermc.io/v3/projects/paper`（可用版本）→ `/versions/<v>/builds/latest` | `paper-<v>-<build>.jar` | **sha256** |
| Purpur | `https://api.purpurmc.org/v2/purpur`（版本列表）→ `/v2/purpur/<v>/latest/download` | jar | 无（只给 md5） |
| Fabric | `meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/<installer>/server/jar` | `fabric-server-launch.jar` | 无 |
| Forge | `files.minecraftforge.net/.../promotions_slim.json`（版本表）→ maven installer | `forge-<v>-installer.jar` + `--installServer` | 无 |
| NeoForge | maven.neoforged.net（本机 DNS 被拦，**未实测**）| `neoforge-<v>-installer.jar` + `--installServer` | 无 |

实测样例（Paper 26.1.2）：

```json
{"id":74,"channel":"STABLE",
 "downloads":{"server:default":{
   "name":"paper-26.1.2-74.jar",
   "size":52893229,
   "checksums":{"sha256":"1d70b1..."},
   "url":"https://fill-data.papermc.io/v1/objects/<sha256>/paper-26.1.2-74.jar"}}}
```

### 启动命令（**这里最容易做错**）

| 类型 | 正确启动方式 |
|---|---|
| vanilla / Paper / Purpur | `java -Xms.. -Xmx.. -jar <server>.jar nogui` |
| Fabric | `java -Xms.. -Xmx.. -jar fabric-server-launch.jar nogui` |
| **Forge / NeoForge（1.17+）** | **不能** `java -jar`。安装器会生成 `run.sh` / `run.bat` + `user_jvm_args.txt`，真实参数在 `libraries/net/{neoforged,minecraftforge}/.../{unix,win}_args.txt`。正确做法：把内存写进 `user_jvm_args.txt`，然后 `java @user_jvm_args.txt @libraries/.../win_args.txt nogui` |

> 这一条直接决定"装了 NeoForge 但启动不了"会不会发生。现在的实现是 `java -jar`，只对 vanilla/fabric 成立。

### 内容目录

| 类型 | 目录 | 我们能做什么 |
|---|---|---|
| vanilla | — | 只有数据包 / 世界设置 |
| Paper / Purpur | `plugins/` | 插件搜索、安装、禁用（`.disabled`）|
| Fabric / Forge / NeoForge | `mods/` | 模组搜索、安装、禁用、服务端/客户端标记 |

**同一个"资源库"，对插件服和模组服必须是两套数据源、两套筛选项。**
（Modrinth 的 `project_type` 本身就分 `mod` 与 `plugin`；Paper 侧还有 Hangar。）

### Java 要求
- 权威来源是**版本 json 里的 `javaVersion.majorVersion`**，不是硬编码表。
- 已知：1.20.5+ 需要 Java 21；1.12.2 的 Forge 需要 **Java 8**（老整合包的真实坑）。
- 现状（`electron/ipc/java.js`）只是"取 major 最大/>=21 的那个"，按版本查表要改成从版本元数据读。

---

## 3. 导入既有服务器：怎么"猜"类型

服主真正的痛点往往不是"不会装"，而是"我已经有一个服了，能不能直接管"。
靠标志文件判断，置信度从高到低：

| 标志 | 判断 |
|---|---|
| `libraries/net/neoforged/` | NeoForge |
| `libraries/net/minecraftforge/` + `run.sh`/`run.bat` | Forge |
| `config/paper-global.yml` 或 `paper.yml` 或 `version_history.json` | Paper |
| `purpur.yml` | Purpur |
| `fabric-server-launch.jar` 或 `.fabric/` | Fabric |
| `plugins/` 存在 | Bukkit 系（至少插件服）|
| `mods/` 存在 | 模组服（配合上面的 loader 判断）|
| 只有 `server.jar` | 原版 |

`server.jar` 本身也能读 `META-INF/MANIFEST.MF` 的 `Main-Class`：`io.papermc.paper.Main` → Paper，
`net.minecraft.bundler.Main` → 原版，等等。作为兜底手段。

---

## 4. 我们支持到哪一步（建议）

| 阶段 | 内容 | 理由 |
|---|---|---|
| P0 | vanilla / Fabric（**已有**） | 现状 |
| **P0.5** | **Paper / Purpur** | 水桶服是主流；不做等于把最大一群人挡在门外；下载 API 干净（有 sha256）|
| P1 | NeoForge / Forge | 整合包服；安装要跑 installer，工作量中等 |
| P2 | Velocity 代理 + Geyser 基岩互通 | 进阶但高价值 |
| 不做 | 混合服安装 | 只识别 + 警告 |

**抽象方式**：把现在写死的 `versions.installServer` 改成 provider 表：

```ts
interface ServerProvider {
  id: "vanilla" | "paper" | "purpur" | "fabric" | "neoforge" | "forge";
  label: string;
  contentKind: "none" | "plugin" | "mod";
  listVersions(): Promise<string[]>;          // 支持哪些 MC 版本
  listBuilds(mc: string): Promise<string[]>;  // 该 MC 版本下的核心版本
  install(opts): Promise<{ ok, launch }>;     // 下载 + 安装 + 返回启动方式
  launch(instance): LaunchSpec;               // java 参数 / 工作目录 / 额外文件
  detect(dir): Promise<id | null>;            // 导入用
}
```

`LaunchSpec` 里要能表达"不是 -jar，而是一组 @argsfile"，否则 NeoForge 一定启动失败。

---

## 5. 还没验证的

- NeoForge 在 26.1 的具体版本号（本机 DNS 解析不到 maven.neoforged.net，无法实测）。
- Forge 26.x 的 `--installServer` 产物结构与 1.20.x 是否一致（大概率一致）。
- Geyser 对 26.x 的支持情况。
