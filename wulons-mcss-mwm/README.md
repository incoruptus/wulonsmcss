# MWM · Multi-World Management

**Minecraft 26.1 自定义维度数据包生成器**

`wulons-mcss-mwm` 是一个 CLI 工具，用于生成 Minecraft 数据包来创建自定义维度（世界）。无需 Fabric 模组，纯数据包即可实现多世界管理。

## 工作原理

Minecraft 26.1+ 支持通过数据包定义自定义维度 —— 每个维度由一个 `dimension` JSON 和一个 `dimension_type` JSON 组成。本工具自动生成这些文件。

## 使用方法

### 1. 编辑配置

```bash
# 原版世界
cp worlds.example.json worlds.json

# 模组生物群系世界（Biomes O' Plenty、遍历、Terralith）
cp worlds.mod.example.json worlds.json

# 然后编辑 worlds.json 按需添加/修改世界
```

### 2. 生成数据包

```bash
node src/cli.js worlds.json
```

输出目录：`output/`

### 3. 安装到服务器

将生成的 `mwm-<namespace>-all` 文件夹复制到 `world/datapacks/` 目录下，然后在服务器控制台执行：

```
/reload
```

### 4. 传送

```
/execute in wulons:mining_world run tp @s ~ ~ ~
```

## 配置文件格式

```json
{
  "namespace": "wulons",
  "worlds": [
    {
      "name": "my_world",
      "label": "我的世界",
      "type": "overworld",
      // 方式一：使用 preset（仅原版群系）
      "biome_preset": "minecraft:overworld",

      // 方式二：显式 biome 列表（支持模组群系）
      "biomes": [
        "minecraft:plains",
        "biomesoplenty:rainforest",
        "terralith:sakura_grove",
        "traverse:autumnal_woodland"
      ],

      // 方式三：单一生物群系（整个世界一种群系）
      "single_biome": "biomesoplenty:rainforest",

      "structures": true,
      "seed": 42,
      "description": "描述文字"
    }
  ]
}
```

## 生物群系配置方式

| 方式 | 字段 | 效果 | 模组支持 |
|------|------|------|----------|
| Preset（默认） | `biome_preset` | 使用原版预设群系列表 | ❌ 仅有原版群系 |
| 显式列表 | `biomes` | 手动列出所有允许出现的群系 | ✅ 支持模组群系 |
| 固定群系 | `single_biome` | 整个世界只有一种群系 | ✅ 支持模组群系 |

### 使用模组生物群系

要包含模组生物群系（Biomes O' Plenty、遍历 Traverse、Terralith 等），使用 `biomes` 字段列出模组的群系 ID：

```json
{
  "name": "bop_adventure",
  "type": "overworld",
  "biomes": [
    "biomesoplenty:rainforest",
    "biomesoplenty:jade_cliffs",
    "biomesoplenty:cherry_blossom_grove",
    "biomesoplenty:lavender_field"
  ]
}
```

群系 ID 格式为 `<mod_id>:<biome_name>`，需要查询对应模组的文档或 JEI。

> ⚠️ **注意**：Terralith 通常通过数据包覆写主世界群系来工作。在自定义维度中使用 Terralith 群系时，请确保同时安装了 Terralith 的数据包和模组。建议将 Terralith 的数据包也放入 `world/datapacks/` 中。

### 世界类型说明

| 类型 | 效果 |
|------|------|
| `overworld` | 主世界风格，有昼夜、天空、群系 |
| `nether` | 下界风格，炎热、无天空、8 倍坐标缩放 |
| `the_end` | 末地风格，固定时间、无天空 |
| `superflat` | 超平坦，适合建筑 |
| `void` | 虚空，只有一块基岩 |

## 输出结构

```
output/
├── mwm-<namespace>-<world>/
│   ├── pack.mcmeta
│   └── data/<namespace>/
│       ├── dimension/<world>.json
│       └── dimension_type/<world>.json
│
└── mwm-<namespace>-all/              ← 合并包（包含所有世界）
    ├── pack.mcmeta
    ├── README.txt
    └── data/<namespace>/
        ├── dimension/
        │   ├── <world1>.json
        │   └── <world2>.json
        └── dimension_type/
            ├── <world1>.json
            └── <world2>.json
```

## 技术细节

- **数据包格式**: `pack_format: 48`（Minecraft 26.1）
- **维度类型**: 定义了世界的物理特性（高度、光照、重力等）
- **维度**: 定义了世界的生成器（噪声/平坦）和群系来源
- **不需要 Fabric 模组**：纯原版数据包，任何 26.1 服务端均可使用
- **无损移除**：删除数据包后世界文件仍在，可随时重新加载

## 开发

```bash
node src/cli.js worlds.example.json  # 测试生成示例配置
```