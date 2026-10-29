# Forge / NeoForge 接入设计（未完成）

> 只差这一块，⑧「服务端核心 provider」就齐了。这一页是给下一轮直接开工用的：
> 所有会踩的坑都已经踩过一遍（探测端点、启动方式、阻塞点）。

## 1. 现实约束（实测）

| 端点 | 结果 |
|---|---|
| `files.minecraftforge.net/.../promotions_slim.json` | **200**，可拿到 26.1.2 → `64.1.5` 这类版本 |
| `maven.neoforged.net/.../neoforged/neoforge/maven-metadata.xml` | **000（本机 DNS 解析不到）** |
| `fill.papermc.io` / `api.purpurmc.org` / `meta.fabricmc.net` | 200（已接入） |

结论：**Forge 可验证，NeoForge 在当前机器上无法实测**——代码照写，验证要诚实标注"未验证"。

## 2. 安装方式（与前三家都不同）

Paper/Purpur/Fabric/Vanilla 都是"下载一个 jar 就完事"，Forge/NeoForge 要**跑安装器**：

```
java -jar forge-<mc>-<ver>-installer.jar --installServer <dir>
```

- 它会自己下载 vanilla jar + 一堆 libraries，耗时几分钟、输出很长
- 装完生成 `run.sh` / `run.bat`、`user_jvm_args.txt`、`libraries/...`

因此需要一条**新的通用通道**：跑一个子进程、等它结束、把输出带回来。

```ts
// 建议命名（两个 shell 都实现）
proc:run  ({ command: string[], cwd?: string, timeoutMs?: number })
        => { code: number, stdoutTail: string, stderrTail: string }
```
> 输出只回尾部（例如 200 行）就够用了；安装器的进度条不是给人看的，
> 我们要的是"装成功了/失败原因"。

## 3. 启动方式（最容易做错的地方）

Forge 1.17+ / NeoForge **不能** `java -jar`。真实启动参数在
`libraries/net/{minecraftforge,neoforged}/<artifact>/<version>/win_args.txt` 里：

```bash
java @user_jvm_args.txt @libraries/net/neoforged/neoforge/<ver>/win_args.txt nogui
```

- 内存要写进 `user_jvm_args.txt`（`-Xms.. -Xmx..`），不是命令行
- 现在的 `server.js` 只会 `java -jar <jar> nogui`，对这两家**必然失败**

改造点（两处，必须同时改，否则网页版与桌面版行为分叉）：

1. `electron/ipc/server.js`：启动前读实例目录里的 `.mcss-server.json`；
   `forge`/`neoforge` → 走 argsfile 分支；其余维持 `-jar`
2. `agent/src/main.rs`：同一份判断逻辑

判断依据不要靠猜：
- `libraries/net/neoforged/**/win_args.txt` → NeoForge
- `libraries/net/minecraftforge/**/win_args.txt` → Forge
- 都找不到就退回 `-jar`（老版本 Forge 1.12 确实有 `forge-*.jar` 可直接跑）

## 4. 版本列表

| 核心 | 来源 | 版本号形如 |
|---|---|---|
| Forge | `promotions_slim.json` 的 `promos["<mc>-latest"]` | `64.1.5` |
| NeoForge | `maven-metadata.xml` 的 `<versions>`（过滤掉与 mc 不匹配的） | `26.1.xxx` |

## 5. 接入后要补的验收

- [ ] 新建实例的核心里出现 Forge / NeoForge（当前刻意只放 4 个，避免假按钮）
- [ ] 装 Forge 26.1.2 真跑一次安装器，`win_args.txt` 真的生成
- [ ] 用 argsfile 方式启动到 `Done (x.xs)!`
- [ ] agent 侧同样装一次、起一次（网页版不落后）
- [ ] `versions:detect-server` 对这两种目录已经能认（**已实现，无需改动**）

## 6. 已知风险

- 安装器联网下载 libraries，国内可能极慢 → 需要把安装器输出里的进度回传，
  或者至少给一个"正在装 libraries，可能要几分钟"的明确文案
- 安装器失败时退出码为 0 但实际没装成功（历史上出现过），
  所以"成功"的判据应该是 **`win_args.txt` 是否生成**，而不是退出码
- NeoForge 当前无法访问 → 先做成"能装但未验证"，不要假装验证过
