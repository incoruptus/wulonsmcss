# MWM 多世界管理 — Fabric 模组

**Minecraft 1.21.4 + Fabric 客户端模组**

## 功能

- **左下角世界切换器 HUD** — 按下 `P` 键展开世界列表，点击即可传送
- **`/mwm world list`** — 列出所有可用世界
- **`/mwm world tp <id>`** — 传送到指定世界

## 构建

需要 JDK 21 + Gradle。

### 快速开始 (Windows)

```powershell
# 1. 下载 Gradle Wrapper
gradle wrapper --gradle-version 8.12

# 2. 构建
gradlew build

# 3. 输出文件
build/libs/wulons-mwm-mod-26.1.0.jar
```

### 安装

将生成的 `.jar` 放入客户端的 `mods/` 文件夹，服务端也需安装（用于处理传送请求）。

## 按键

| 按键 | 功能 |
|------|------|
| `P` | 切换世界选择面板 |
| 鼠标左键点击世界 | 传送至该世界 |

## 指令

| 指令 | 用途 |
|------|------|
| `/mwm world list` | 列出所有世界 |
| `/mwm world tp <id>` | 传送到指定世界 |

## 技术架构

```
┌──────────────────────┐     CustomPayload     ┌──────────────────────┐
│  客户端                │ ◄──────────────────► │  服务端                │
│  WorldSwitcherHud     │   TeleportPayload    │  MwmCommand          │
│  (左下角 HUD)          │                      │  (/mwm world tp)     │
└──────────────────────┘                      └──────────────────────┘
```

- HUD 显示在游戏窗口左下角，按 `P` 展开/折叠
- 点击世界条目 → 客户端发送 `TeleportPayload` → 服务端处理传送
- `/mwm` 指令服务端注册，用于测试和调试