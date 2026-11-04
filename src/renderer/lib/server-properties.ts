/**
 * server.properties 的人话层
 * ------------------------------------------------------------
 * 这一页以前直接把 `pvp / allow-flight / peaceful / minecraft:normal`
 * 这些内部键名摆给用户看。新手一个都不敢动，也不知道改了什么。
 * 这里把「键 → 这是什么 / 改了会怎样 / 值怎么翻」集中成一份表。
 *
 * label / hint 是中文兜底，labelKey / hintKey 供渲染时取当前语言；
 * 模块加载时不取值，切换语言后重新渲染即可生效。
 */

export interface PropMeta {
  label: string;
  labelKey: string;
  hint?: string;
  hintKey?: string;
}

export const TEXT_META: Record<string, PropMeta> = {
  motd: {
    label: "服务器标语（MOTD）",
    labelKey: "prop.motd.label",
    hint: "显示在多人游戏服务器列表中的欢迎语，支持使用 § 颜色代码",
    hintKey: "prop.motd.hint",
  },
  "max-players": { label: "最大玩家数", labelKey: "prop.max-players.label" },
  "server-port": {
    label: "端口",
    labelKey: "prop.server-port.label",
    hint: "服务器连接端口，默认为 25565；修改后原有邀请将失效，需重新生成",
    hintKey: "prop.server-port.hint",
  },
  "view-distance": {
    label: "视距（区块）",
    labelKey: "prop.view-distance.label",
    hint: "数值越大玩家视野越远，同时会增加服务端内存与 CPU 负载",
    hintKey: "prop.view-distance.hint",
  },
  "simulation-distance": {
    label: "模拟距离（区块）",
    labelKey: "prop.simulation-distance.label",
    hint: "决定玩家周围多少区块内的生物与红石机器保持运转",
    hintKey: "prop.simulation-distance.hint",
  },
  "spawn-protection": {
    label: "出生点保护半径",
    labelKey: "prop.spawn-protection.label",
    hint: "非管理员（OP）玩家无法在出生点保护范围内破坏或放置方块",
    hintKey: "prop.spawn-protection.hint",
  },
  "level-seed": {
    label: "世界种子",
    labelKey: "prop.level-seed.label",
    hint: "留空则随机生成种子，仅对新建世界生效",
    hintKey: "prop.level-seed.hint",
  },
};

export const BOOL_META: Record<string, PropMeta> = {
  pvp: {
    label: "玩家互相伤害（PvP）",
    labelKey: "prop.pvp.label",
    hint: "关闭后玩家之间无法互相造成伤害",
    hintKey: "prop.pvp.hint",
  },
  "online-mode": {
    label: "仅允许正版 Minecraft 账号进入服务器",
    labelKey: "prop.online-mode.label",
    hint: "关闭后允许非正版客户端进入，但存在同名账号被冒用的风险；若朋友无法进入，请先确认其是否使用正版登录",
    hintKey: "prop.online-mode.hint",
  },
  "allow-flight": {
    label: "允许飞行",
    labelKey: "prop.allow-flight.label",
    hint: "生存模式下默认关闭；若安装了飞行类模组或防作弊误判，建议开启",
    hintKey: "prop.allow-flight.hint",
  },
  "white-list": {
    label: "启用白名单",
    labelKey: "prop.white-list.label",
    hint: "开启后仅白名单内的玩家可进入服务器",
    hintKey: "prop.white-list.hint",
  },
  "enforce-whitelist": {
    label: "强制白名单",
    labelKey: "prop.enforce-whitelist.label",
    hint: "开启白名单后，立即将不在名单内的当前在线玩家移出服务器",
    hintKey: "prop.enforce-whitelist.hint",
  },
  "enable-command-block": {
    label: "启用命令方块",
    labelKey: "prop.enable-command-block.label",
    hint: "多用于机关地图或小游戏服，普通生存服可保持关闭",
    hintKey: "prop.enable-command-block.hint",
  },
  hardcore: {
    label: "极限模式",
    labelKey: "prop.hardcore.label",
    hint: "开启后玩家死亡即转为旁观模式且无法复活，存档生成后难以逆转",
    hintKey: "prop.hardcore.hint",
  },
  "allow-nether": { label: "允许去下界", labelKey: "prop.allow-nether.label" },
  "spawn-animals": { label: "生成动物", labelKey: "prop.spawn-animals.label" },
  "spawn-monsters": { label: "生成怪物", labelKey: "prop.spawn-monsters.label" },
  "spawn-npcs": { label: "生成村民", labelKey: "prop.spawn-npcs.label" },
};

/** 开关默认顺序：先常用、影响大的 */
export const BOOL_ORDER = [
  "pvp",
  "online-mode",
  "allow-flight",
  "white-list",
  "enforce-whitelist",
  "hardcore",
  "allow-nether",
  "enable-command-block",
  "spawn-animals",
  "spawn-monsters",
  "spawn-npcs",
];

export interface SelectMeta {
  label: string;
  labelKey: string;
  hint: string;
  hintKey: string;
  options: { value: string; label: string; labelKey: string }[];
}

export const SELECT_META: Record<string, SelectMeta> = {
  difficulty: {
    label: "难度",
    labelKey: "prop.difficulty.label",
    hint: "和平模式下不生成敌对生物，困难模式下怪物造成的伤害更高",
    hintKey: "prop.difficulty.hint",
    options: [
      { value: "peaceful", label: "和平", labelKey: "prop.difficulty.opt.peaceful" },
      { value: "easy", label: "简单", labelKey: "prop.difficulty.opt.easy" },
      { value: "normal", label: "普通", labelKey: "prop.difficulty.opt.normal" },
      { value: "hard", label: "困难", labelKey: "prop.difficulty.opt.hard" },
    ],
  },
  gamemode: {
    label: "新玩家默认模式",
    labelKey: "prop.gamemode.label",
    hint: "日常联机通常选择生存模式，创造模式适合建筑与测试",
    hintKey: "prop.gamemode.hint",
    options: [
      { value: "survival", label: "生存", labelKey: "prop.gamemode.opt.survival" },
      { value: "creative", label: "创造", labelKey: "prop.gamemode.opt.creative" },
      { value: "adventure", label: "冒险", labelKey: "prop.gamemode.opt.adventure" },
      { value: "spectator", label: "旁观", labelKey: "prop.gamemode.opt.spectator" },
    ],
  },
  leveltype: {
    label: "地图类型",
    labelKey: "prop.leveltype.label",
    hint: "仅对新生成的世界生效，不影响已有存档",
    hintKey: "prop.leveltype.hint",
    options: [
      { value: "minecraft:normal", label: "默认", labelKey: "prop.leveltype.opt.minecraft:normal" },
      { value: "minecraft:flat", label: "超平坦", labelKey: "prop.leveltype.opt.minecraft:flat" },
      {
        value: "minecraft:large_biomes",
        label: "巨型生物群系",
        labelKey: "prop.leveltype.opt.minecraft:large_biomes",
      },
      { value: "minecraft:amplified", label: "放大化", labelKey: "prop.leveltype.opt.minecraft:amplified" },
    ],
  },
};
