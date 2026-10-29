# 下载行为契约

下载逻辑有两份实现：

| 位置 | 语言 | 用在 |
|---|---|---|
| `electron/ipc/download.js` | Node | 桌面版（服务端 jar、Mod、frpc） |
| `agent/src/main.rs` 的 `download_to` | Rust | 网页版 + 本地助手 |

两份实现容易悄悄漂移，所以用**同一份场景清单**约束它们：`scripts/download-contract.json`。

## 五个场景

| id | 规则 |
|---|---|
| `fresh` | 正常下载，结束时校验 sha1 且与内容一致 |
| `resume` | 目标旁有 `.part` 时带 `Range` 续传，最终文件完整 |
| `norange` | 服务端不支持 Range（回 200）时从头重下，不产生重复内容 |
| `bad-hash` | 某个源校验不过时丢弃半成品，换下一个源 |
| `all-fail` | 全部源都失败时抛错，且目标路径不留下半成品 |

## 怎么保证两边都测了

`pnpm test` 会跑 `scripts/check-download-contract.cjs`，它检查两个测试文件里
是否都出现了 `[场景 id]`：

```
PASS  Node（electron/ipc/download.test.ts） 覆盖 5 个场景
PASS  Rust（agent/src/main.rs 的 download_contract） 覆盖 5 个场景
```

## 两个实现里踩过的坑（都是真事）

1. **Node 不能用 `fetch`**：它走全局连接池，keep-alive 的套接字会让进程退不出去；
   改成 `http/https` + `agent: false`，一次一个连接、用完就关。
2. **`createWriteStream` 不认 `"wb"`**：只接受 `"w"`/`"a"`，写错会抛 `ERR_INVALID_ARG_VALUE`。
3. **206 响应必须带 `Content-Range`**：否则 curl 会认为响应不完整，续传后内容错位。
4. **Windows 上 rename 会被杀软短暂占用**：下完先重试几次，仍失败退化成复制。
5. **cargo test 并行**：临时目录只按秒命名会让用例互相删文件，要加 pid + 计数器。
