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
  motd: { label: "服务器标语（MOTD）", hint: "多人列表里显示的一行字；支持 § 颜色代码" },
  "max-players": { label: "最大玩家数" },
  "server-port": { label: "端口", hint: "朋友连进来的门牌号，默认 25565；改了之后旧邀请会失效" },
  "view-distance": { label: "视距（区块）", hint: "越大看得越远，也越吃内存和 CPU" },
  "simulation-distance": { label: "模拟距离（区块）", hint: "多远以内的生物、机器还会运转" },
  "spawn-protection": { label: "出生点保护半径", hint: "非 OP 玩家不能破坏出生点附近" },
  "level-seed": { label: "世界种子", hint: "留空就随机；只对新世界生效" },
};

export const BOOL_META: Record<string, PropMeta> = {
  pvp: { label: "玩家互相伤害（PvP）", hint: "关掉后玩家之间不能攻击" },
  "online-mode": {
    label: "只允许正版账号进入",
    hint: "关掉后任何客户端都能进，用户名也可能被冒用；朋友进不来时先问清楚他用的是不是正版",
  },
  "allow-flight": { label: "允许飞行", hint: "生存模式默认禁止；只有装飞行类 Mod 才需要开" },
  "white-list": { label: "启用白名单", hint: "只有名单里的玩家能进" },
  "enforce-whitelist": { label: "强制白名单", hint: "把不在名单里的在线玩家踢掉" },
  "enable-command-block": { label: "启用命令方块", hint: "地图/小游戏常用；普通生存可以关" },
  hardcore: { label: "极限模式", hint: "死亡后不能复活；开了很难回头" },
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
    hint: "和平模式不会生成怪物；困难模式怪物伤害更高",
    options: [
      { value: "peaceful", label: "和平" },
      { value: "easy", label: "简单" },
      { value: "normal", label: "普通" },
      { value: "hard", label: "困难" },
    ],
  },
  gamemode: {
    label: "新玩家默认模式",
    hint: "生存最常用；创造适合建筑/测试",
    options: [
      { value: "survival", label: "生存" },
      { value: "creative", label: "创造" },
      { value: "adventure", label: "冒险" },
      { value: "spectator", label: "旁观" },
    ],
  },
  leveltype: {
    label: "地图类型",
    hint: "只影响新生成的世界；已有存档不会变",
    options: [
      { value: "minecraft:normal", label: "默认" },
      { value: "minecraft:flat", label: "超平坦" },
      { value: "minecraft:large_biomes", label: "巨型生物群系" },
      { value: "minecraft:amplified", label: "放大化" },
    ],
  },
};
