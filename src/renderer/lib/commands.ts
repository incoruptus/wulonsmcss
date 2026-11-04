/**
 * 指令目录与补全
 * 覆盖原版常用指令 + 服务器运维常用项；Tab 补全只做「够用且不出错」的那一层。
 *
 * desc / args 是中文兜底，descKey / argsKey 供渲染时取当前语言；
 * 模块加载时不取值，切换语言后重新生成补全列表即可生效。
 */

import { tGlobal } from "../i18n/core";

export interface CommandSpec {
  name: string;
  desc: string;
  /** 说明的词典 key */
  descKey: string;
  /** 参数提示 */
  args?: string;
  /** 参数提示的词典 key */
  argsKey?: string;
  /** 需要 OP */
  op?: boolean;
  /** 危险操作（二次确认） */
  danger?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  { name: "list", desc: "列出在线玩家", descKey: "command.list.desc" },
  { name: "tps", desc: "查看服务器 TPS（Paper/Spigot）", descKey: "command.tps.desc" },
  { name: "mspt", desc: "查看每 tick 耗时（Paper）", descKey: "command.mspt.desc" },
  { name: "say", desc: "向全服广播一条消息", descKey: "command.say.desc", args: "<消息>", argsKey: "command.say.args" },
  {
    name: "tell",
    desc: "私聊某个玩家",
    descKey: "command.tell.desc",
    args: "<玩家> <消息>",
    argsKey: "command.tell.args",
    op: true,
  },
  {
    name: "tellraw",
    desc: "发送 JSON 文本",
    descKey: "command.tellraw.desc",
    args: "<目标> <json>",
    argsKey: "command.tellraw.args",
    op: true,
  },
  {
    name: "title",
    desc: "标题栏提示",
    descKey: "command.title.desc",
    args: "<玩家> title <文本>",
    argsKey: "command.title.args",
    op: true,
  },
  { name: "op", desc: "给予管理员权限", descKey: "command.op.desc", args: "<玩家>", argsKey: "command.op.args", op: true },
  {
    name: "deop",
    desc: "收回管理员权限",
    descKey: "command.deop.desc",
    args: "<玩家>",
    argsKey: "command.deop.args",
    op: true,
  },
  {
    name: "kick",
    desc: "把玩家踢出服务器",
    descKey: "command.kick.desc",
    args: "<玩家> [原因]",
    argsKey: "command.kick.args",
    op: true,
  },
  {
    name: "ban",
    desc: "封禁玩家",
    descKey: "command.ban.desc",
    args: "<玩家> [原因]",
    argsKey: "command.ban.args",
    op: true,
    danger: true,
  },
  {
    name: "pardon",
    desc: "解除封禁",
    descKey: "command.pardon.desc",
    args: "<玩家>",
    argsKey: "command.pardon.args",
    op: true,
  },
  {
    name: "whitelist",
    desc: "白名单：on/off/add/remove/list",
    descKey: "command.whitelist.desc",
    args: "add <玩家>",
    argsKey: "command.whitelist.args",
    op: true,
  },
  {
    name: "gamemode",
    desc: "切换游戏模式",
    descKey: "command.gamemode.desc",
    args: "survival|creative|adventure|spectator [玩家]",
    argsKey: "command.gamemode.args",
    op: true,
  },
  {
    name: "difficulty",
    desc: "设置难度",
    descKey: "command.difficulty.desc",
    args: "peaceful|easy|normal|hard",
    argsKey: "command.difficulty.args",
    op: true,
  },
  {
    name: "time",
    desc: "设置时间",
    descKey: "command.time.desc",
    args: "set day|night|<数字>",
    argsKey: "command.time.args",
    op: true,
  },
  {
    name: "weather",
    desc: "设置天气",
    descKey: "command.weather.desc",
    args: "clear|rain|thunder [时长]",
    argsKey: "command.weather.args",
    op: true,
  },
  {
    name: "gamerule",
    desc: "查看/修改游戏规则",
    descKey: "command.gamerule.desc",
    args: "<规则> [值]",
    argsKey: "command.gamerule.args",
    op: true,
  },
  {
    name: "daylight",
    desc: "昼夜循环开关（部分版本）",
    descKey: "command.daylight.desc",
    args: "on|off",
    argsKey: "command.daylight.args",
    op: true,
  },
  {
    name: "setworldspawn",
    desc: "设置世界出生点",
    descKey: "command.setworldspawn.desc",
    args: "[坐标]",
    argsKey: "command.setworldspawn.args",
    op: true,
  },
  {
    name: "tp",
    desc: "传送玩家",
    descKey: "command.tp.desc",
    args: "<玩家> <目标>",
    argsKey: "command.tp.args",
    op: true,
  },
  {
    name: "give",
    desc: "给玩家物品",
    descKey: "command.give.desc",
    args: "<玩家> <物品> [数量]",
    argsKey: "command.give.args",
    op: true,
  },
  {
    name: "effect",
    desc: "添加/移除药水效果",
    descKey: "command.effect.desc",
    args: "give|clear <玩家> ...",
    argsKey: "command.effect.args",
    op: true,
  },
  {
    name: "enchant",
    desc: "附魔手持物品",
    descKey: "command.enchant.desc",
    args: "<玩家> <附魔> [等级]",
    argsKey: "command.enchant.args",
    op: true,
  },
  {
    name: "xp",
    desc: "给予经验",
    descKey: "command.xp.desc",
    args: "add <玩家> <数量>",
    argsKey: "command.xp.args",
    op: true,
  },
  {
    name: "summon",
    desc: "生成实体",
    descKey: "command.summon.desc",
    args: "<实体> [坐标]",
    argsKey: "command.summon.args",
    op: true,
  },
  {
    name: "execute",
    desc: "以特定上下文执行指令",
    descKey: "command.execute.desc",
    args: "as <目标> at @s run ...",
    argsKey: "command.execute.args",
    op: true,
  },
  {
    name: "fill",
    desc: "填充方块",
    descKey: "command.fill.desc",
    args: "<起点> <终点> <方块>",
    argsKey: "command.fill.args",
    op: true,
    danger: true,
  },
  {
    name: "clone",
    desc: "复制区域",
    descKey: "command.clone.desc",
    args: "<起点> <终点> <目标>",
    argsKey: "command.clone.args",
    op: true,
    danger: true,
  },
  {
    name: "setblock",
    desc: "放置方块",
    descKey: "command.setblock.desc",
    args: "<坐标> <方块>",
    argsKey: "command.setblock.args",
    op: true,
  },
  {
    name: "save-all",
    desc: "立即保存世界",
    descKey: "command.save-all.desc",
    args: "[flush]",
    argsKey: "command.save-all.args",
    op: true,
  },
  { name: "save-off", desc: "暂停自动保存（备份前用）", descKey: "command.save-off.desc", op: true },
  { name: "save-on", desc: "恢复自动保存", descKey: "command.save-on.desc", op: true },
  { name: "reload", desc: "重载数据包与部分配置", descKey: "command.reload.desc", op: true },
  { name: "stop", desc: "保存并关闭服务器", descKey: "command.stop.desc", danger: true },
  { name: "seed", desc: "查看世界种子", descKey: "command.seed.desc", op: true },
  {
    name: "spawnpoint",
    desc: "设置玩家出生点",
    descKey: "command.spawnpoint.desc",
    args: "[玩家] [坐标]",
    argsKey: "command.spawnpoint.args",
    op: true,
  },
  {
    name: "setidletimeout",
    desc: "挂机踢出时间（分钟）",
    descKey: "command.setidletimeout.desc",
    args: "<分钟>",
    argsKey: "command.setidletimeout.args",
    op: true,
  },
  {
    name: "worldborder",
    desc: "世界边界",
    descKey: "command.worldborder.desc",
    args: "set|center|get ...",
    argsKey: "command.worldborder.args",
    op: true,
  },
  {
    name: "datapack",
    desc: "数据包管理",
    descKey: "command.datapack.desc",
    args: "list|reload|enable|disable",
    argsKey: "command.datapack.args",
    op: true,
  },
  {
    name: "bossbar",
    desc: "Boss 血条",
    descKey: "command.bossbar.desc",
    args: "add|set|remove ...",
    argsKey: "command.bossbar.args",
    op: true,
  },
  {
    name: "scoreboard",
    desc: "计分板",
    descKey: "command.scoreboard.desc",
    args: "objectives|players ...",
    argsKey: "command.scoreboard.args",
    op: true,
  },
  {
    name: "tag",
    desc: "实体标签",
    descKey: "command.tag.desc",
    args: "<玩家> add|remove <标签>",
    argsKey: "command.tag.args",
    op: true,
  },
  { name: "me", desc: "以第三人称发言", descKey: "command.me.desc", args: "<动作>", argsKey: "command.me.args" },
  { name: "help", desc: "查看指令帮助", descKey: "command.help.desc", args: "[指令]", argsKey: "command.help.args" },
];

const ENUMS: Record<string, string[]> = {
  gamemode: ["survival", "creative", "adventure", "spectator"],
  difficulty: ["peaceful", "easy", "normal", "hard"],
  weather: ["clear", "rain", "thunder"],
  time: ["set", "add", "query"],
  whitelist: ["on", "off", "add", "remove", "list", "reload"],
  save: ["save-all", "save-on", "save-off"],
  datapack: ["list", "reload", "enable", "disable"],
  worldborder: ["set", "center", "get", "damage", "warning"],
};

/** 这些指令的第二个参数是玩家名 */
const PLAYER_ARG_CMDS = new Set([
  "op",
  "deop",
  "kick",
  "ban",
  "pardon",
  "tell",
  "tp",
  "give",
  "effect",
  "enchant",
  "xp",
  "tag",
  "spawnpoint",
  "title",
]);

export interface Suggestion {
  /** 补全后的完整输入 */
  value: string;
  label: string;
  hint?: string;
}

/**
 * 根据当前输入给出补全建议。
 * - 第一个词：指令名
 * - 后续：玩家名 / 枚举值
 */
export function suggestCommands(input: string, players: string[]): Suggestion[] {
  const raw = input.trimStart();
  if (!raw) return [];
  const parts = raw.split(/\s+/);
  const endsWithSpace = /\s$/.test(raw);

  // 补指令名
  if (parts.length === 1 && !endsWithSpace) {
    const q = parts[0].toLowerCase().replace(/^\//, "");
    return COMMANDS.filter((c) => c.name.startsWith(q))
      .slice(0, 8)
      .map((c) => ({
        value: c.args ? `${c.name} ` : c.name,
        label: c.args ? `${c.name} ${tGlobal(c.argsKey!, c.args)}` : c.name,
        hint: tGlobal(c.descKey, c.desc),
      }));
  }

  const cmd = parts[0].replace(/^\//, "").toLowerCase();
  const last = endsWithSpace ? "" : parts[parts.length - 1];
  const before = endsWithSpace ? parts.slice(1) : parts.slice(1, -1);

  let pool: string[] = [];
  if (PLAYER_ARG_CMDS.has(cmd) && before.length === 0) pool = players;
  else if (ENUMS[cmd]) pool = ENUMS[cmd];
  else if (cmd === "whitelist" && before[0] === "add") pool = players;
  else if (cmd === "whitelist" && before[0] === "remove") pool = players;
  else if (cmd === "gamerule") pool = ["doDaylightCycle", "keepInventory", "mobGriefing", "doFireTick", "randomTickSpeed"];
  else if (cmd === "effect") pool = ["give", "clear"];
  else if (cmd === "xp") pool = ["add", "set", "query"];

  if (pool.length === 0) return [];
  const prefix = last.toLowerCase();
  return pool
    .filter((v) => v.toLowerCase().startsWith(prefix))
    .slice(0, 8)
    .map((v) => ({
      value: `${[cmd, ...before, v].join(" ")} `,
      label: v,
    }));
}
