/**
 * server.properties 的人话层
 * ------------------------------------------------------------
 * 这一页以前直接把 `pvp / allow-flight / peaceful / minecraft:normal`
 * 这些内部键名摆给用户看。新手一个都不敢动，也不知道改了什么。
 * 这里把「键 → 这是什么 / 改了会怎样 / 值怎么翻」集中成一份表。
 */

export interface PropMeta {
  label: string;
  hint?: string;
}

export const TEXT_META: Record<string, PropMeta> = {
  motd: { label: "服务器标语（MOTD）", hint: "显示在多人游戏服务器列表中的欢迎语，支持使用 § 颜色代码" },
  "max-players": { label: "最大玩家数" },
  "server-port": { label: "端口", hint: "服务器连接端口，默认为 25565；修改后原有邀请将失效，需重新生成" },
  "view-distance": { label: "视距（区块）", hint: "数值越大玩家视野越远，同时会增加服务端内存与 CPU 负载" },
  "simulation-distance": { label: "模拟距离（区块）", hint: "决定玩家周围多少区块内的生物与红石机器保持运转" },
  "spawn-protection": { label: "出生点保护半径", hint: "非管理员（OP）玩家无法在出生点保护范围内破坏或放置方块" },
  "level-seed": { label: "世界种子", hint: "留空则随机生成种子，仅对新建世界生效" },
};

export const BOOL_META: Record<string, PropMeta> = {
  pvp: { label: "玩家互相伤害（PvP）", hint: "关闭后玩家之间无法互相造成伤害" },
  "online-mode": {
    label: "仅允许正版 Minecraft 账号进入服务器",
    hint: "关闭后允许非正版客户端进入，但存在同名账号被冒用的风险；若朋友无法进入，请先确认其是否使用正版登录",
  },
  "allow-flight": { label: "允许飞行", hint: "生存模式下默认关闭；若安装了飞行类模组或防作弊误判，建议开启" },
  "white-list": { label: "启用白名单", hint: "开启后仅白名单内的玩家可进入服务器" },
  "enforce-whitelist": { label: "强制白名单", hint: "开启白名单后，立即将不在名单内的当前在线玩家移出服务器" },
  "enable-command-block": { label: "启用命令方块", hint: "多用于机关地图或小游戏服，普通生存服可保持关闭" },
  hardcore: { label: "极限模式", hint: "开启后玩家死亡即转为旁观模式且无法复活，存档生成后难以逆转" },
  "allow-nether": { label: "允许去下界" },
  "spawn-animals": { label: "生成动物" },
  "spawn-monsters": { label: "生成怪物" },
  "spawn-npcs": { label: "生成村民" },
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
  hint: string;
  options: { value: string; label: string }[];
}

export const SELECT_META: Record<string, SelectMeta> = {
  difficulty: {
    label: "难度",
    hint: "和平模式下不生成敌对生物，困难模式下怪物造成的伤害更高",
    options: [
      { value: "peaceful", label: "和平" },
      { value: "easy", label: "简单" },
      { value: "normal", label: "普通" },
      { value: "hard", label: "困难" },
    ],
  },
  gamemode: {
    label: "新玩家默认模式",
    hint: "日常联机通常选择生存模式，创造模式适合建筑与测试",
    options: [
      { value: "survival", label: "生存" },
      { value: "creative", label: "创造" },
      { value: "adventure", label: "冒险" },
      { value: "spectator", label: "旁观" },
    ],
  },
  leveltype: {
    label: "地图类型",
    hint: "仅对新生成的世界生效，不影响已有存档",
    options: [
      { value: "minecraft:normal", label: "默认" },
      { value: "minecraft:flat", label: "超平坦" },
      { value: "minecraft:large_biomes", label: "巨型生物群系" },
      { value: "minecraft:amplified", label: "放大化" },
    ],
  },
};
