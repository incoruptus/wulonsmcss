# 玩家最后一公里：启动方案

> 目标：玩家点开邀请后，除了「准备好文件」，还能真的把游戏开在服务器里。
> 这一步没法靠启动器配合——它没有统一的命令行/协议。所以只能自己来。

## 三条路

| 方案 | 能做什么 | 成本 | 风险 |
|---|---|---|---|
| A. 保持现状 | 生成 `.mrpack` + 打开启动器，玩家手点「导入 → 开始」 | 已完成 | 最后两步是手动的 |
| B. 启动器联动 | 对支持 CLI 的启动器传实例名启动 | 中 | 各家参数不统一，PCL2/HMCL 无法验证；覆盖面窄 |
| C. 自建启动（复用已装版本） | 拼 classpath → 直接 `java --server` | 中高 | 需要正确的 libraries/规则/参数；**不下载游戏本体** |

## 决定：先做 C 的「复用已装版本」半程

**做**：读玩家启动器已经装好的版本（`.minecraft/versions/<id>/<id>.json` + `libraries/` + `assets/`），
拼出启动命令，带上 `--server <addr> --port <port>`，直接开在服务器里。

**不做**（这一阶段）：

- **不下载游戏本体**：没有对应版本就退回方案 A（生成进服包），不做「替你装游戏」
- **不做账号体系**：只支持离线登录（`--username <离线名>`），正版 OAuth 留到后面单独做
- **不改玩家的 `.minecraft`**：只读，不写版本/库/资源

这样做出来的是「进房器」，不是启动器：它不管理版本、不下载资源、不碰账号。

## 启动命令是怎么拼出来的

```
java -Xmx<ram>G
     -Djava.library.path=<natives>
     -cp <libraries...>;<version.jar>
     <主类>
     --username <玩家名> --version <版本id> --gameDir <.minecraft>
     --assetsDir <assets> --assetIndex <index>
     --server <addr> --port <port>
```

要点：

1. **继承**：fabric 的版本 JSON `inheritsFrom` 指向原版，需要合并（子覆盖主类与参数，库取并集）
2. **规则**：`libraries[].rules` 里按 OS / arch 判断，只保留适用的
3. **natives**：老版本靠 `natives` 分类器解压 dll，新版本是独立 artifact，两种都要处理
4. **占位符**：`${library_directory}`、`${classpath_separator}`、`${version_name}` 等要替换
5. **精简参数**：`arguments.jvm` 里带规则的条件项（如 macOS 专属的 `-XstartOnFirstThread`）要按 OS 过滤

## 失败要可诊断

生成计划时先检查一遍，缺什么直接说清楚，而不是让 java 抛一句看不懂的错：

| 情况 | 提示 |
|---|---|
| 没有匹配版本的 `.minecraft` | 「没找到 26.1-fabric，用进服包最省事」 |
| 缺 libraries 文件 | 列出前 3 个缺失的，说明「启动器可能只装了一半」 |
| 缺 assets 索引 | 提示「用启动器打开一次游戏会自动补齐」 |
| Java 版本低于要求 | 提示当前版本与需要的版本 |

## 落地顺序

1. `lib/launch-plan.ts`：纯函数，输入版本 JSON + 文件存在性检查，输出命令与缺失清单（**本轮**）
2. 单测：用合成的 `.minecraft` 夹具覆盖继承、规则、natives、占位符
3. 通道 `client:launch-plan` / `client:launch`：两个外壳各实现一次
4. 加入页：体检通过后主按钮从「准备进游戏」变成「直接进游戏」，失败则退回进服包
