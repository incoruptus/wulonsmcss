# 多世界管理系统 · Multi-World Management

> 构思于 2026-07-14
> 适用于 Wulon's MCSS · 乌龙味MC开服茶

## 设计目标

一个完善的多世界管理系统，让服主可在开服茶中管理多个世界，让玩家可在游戏中方便地切换世界。

## 分层架构

```
+------------------------------------------------------------------+
|  开服茶 (MCSS) — 管理端                                            |
|  · 创建/删除世界                                                  |
|  · 配置世界规则（PVP、难度、游戏模式等）                              |
|  · 管理世界权限（哪些玩家能进入哪些世界）                              |
+------------------------------------------------------------------+
                           │  IPC + MC 指令
                           ▼
+------------------------------------------------------------------+
|  MC 服务端 — 数据层                                                |
|  · Fabric 多世界模组（待 26.1 支持）                                 |
|  · 数据包自定义维度                                                |
|  · 世界文件存储                                                    |
+------------------------------------------------------------------+
                           │  数据同步
                           ▼
+------------------------------------------------------------------+
|  游戏内 UI — 玩家端                                                |
|  · 左下角世界切换器                                                |
|  · 显示当前世界、可切换列表                                          |
|  · 非 OP 玩家也可使用                                              |
+------------------------------------------------------------------+
```

## 功能细节

### 1. 玩家端 — 游戏内世界切换 UI

- 位置：游戏窗口 **左下角**（类似 Xaero 小地图的对角位置）
- 形式：可折叠面板 / 简洁按钮组
- 显示当前世界名称 + 图标
- 点击展开可切换的世界列表
- 切换时调用 `/execute in <dimension> run tp @s <x> <y> <z>`

```lua
-- 伪代码示意
local worldSwitcher = {
  currentWorld = "主世界",
  worlds = {
    { id = "minecraft:overworld", label = "主世界", players = 5 },
    { id = "minecraft:the_nether", label = "下界", players = 1 },
    { id = "minecraft:the_end", label = "末地", players = 0 },
    { id = "wulons:mining_world", label = "挖矿世界", players = 2 },
  }
}
```

- 支持的传送坐标：每个世界独立记录玩家的最后位置（或统一回到世界出生点）
- 非 OP 玩家只能切换到自己有权进入的世界

### 2. 管理端 — 开服茶世界管理

#### 世界列表
- 自动扫描 `world/dimensions/` 获取已有维度
- 每个世界显示：名称 / 命名空间ID / 在线人数 / 状态（加载/卸载）

#### 创建世界
- 输入世界名称（英文）
- 选择世界类型：主世界风格、下界风格、末地风格、超平坦、自定义
- 高级选项：种子、游戏规则、难度
- 生成对应数据包到 `world/datapacks/`
- 自动执行 `/reload` 加载

#### 世界配置
- 开关：启用/禁用世界
- PVP 开关
- 难度（和平/简单/普通/困难）
- 游戏模式（生存/创造/冒险）
- 可见性（所有玩家可见 / 仅 OP 可见 / 仅白名单）

#### 删除世界
- 非主世界可删除
- 确认弹窗 + 备份提示
- 可选择仅移除数据包 / 同时删除存档数据

### 3. 指令系统（服务端）

| 指令 | 用途 |
|------|------|
| `/mcss world list` | 列出所有世界 |
| `/mcss world tp <name>` | 传送到指定世界 |
| `/mcss world info <name>` | 查看世界信息 |
| `/mcss world create <name> [type]` | 创建新世界 |
| `/mcss world remove <name>` | 删除世界 |
| `/mcss world permit <player> <world>` | 允许玩家进入世界 |
| `/mcss world forbid <player> <world>` | 禁止玩家进入世界 |

### 4. 数据包生成规范

Minecraft 26.1 数据包格式（待核实 pack_format）：

```
world/datapacks/<pack-name>/
├── pack.mcmeta
├── data/
│   └── <namespace>/
│       ├── dimension/
│       │   └── <world_name>.json
│       └── dimension_type/
│           └── <world_name>.json
```

**pack.mcmeta**
```json
{
  "pack": {
    "pack_format": 48,
    "description": "Wulon's MCSS - <world_name>"
  }
}
```

**dimension JSON** — 需根据 MC 26.1 的实际格式调整
```json
{
  "type": "<namespace>:<world_name>",
  "generator": {
    "type": "minecraft:noise",
    "settings": "minecraft:overworld",
    "biome_source": {
      "type": "minecraft:multi_noise",
      "preset": "minecraft:overworld"
    }
  }
}
```

## 待办事项

- [ ] 等待 Fabric 多世界模组兼容 26.1
- [ ] 研究 26.1 数据包 `pack_format` 版本号
- [ ] 研究 26.1 维度 JSON 格式变化
- [ ] 实现开服茶端的世界管理 UI
- [ ] 实现游戏内左下角世界切换器 UI
- [ ] 实现服务端指令系统

## 参考资料

- [Minecraft Wiki: Custom Dimension](https://minecraft.wiki/w/Custom_dimension)
- [Minecraft Wiki: Data Pack](https://minecraft.wiki/w/Data_pack)
- Fabric API: `fabric-dimensions-v1`
