/**
 * 指令目录与补全
 * 覆盖原版常用指令 + 服务器运维常用项；Tab 补全只做「够用且不出错」的那一层。
 */

export interface CommandSpec {
  name: string;
  desc: string;
  /** 参数提示 */
  args?: string;
  /** 需要 OP */
  op?: boolean;
  /** 危险操作（二次确认） */
  danger?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  { name: "list", desc: "列出在线玩家" },
  { name: "tps", desc: "查看服务器 TPS（Paper/Spigot）" },
  { name: "mspt", desc: "查看每 tick 耗时（Paper）" },
  { name: "say", desc: "向全服广播一条消息", args: "<消息>" },
  { name: "tell", desc: "私聊某个玩家", args: "<玩家> <消息>", op: true },
  { name: "tellraw", desc: "发送 JSON 文本", args: "<目标> <json>", op: true },
  { name: "title", desc: "标题栏提示", args: "<玩家> title <文本>", op: true },
  { name: "op", desc: "给予管理员权限", args: "<玩家>", op: true },
  { name: "deop", desc: "收回管理员权限", args: "<玩家>", op: true },
  { name: "kick", desc: "把玩家踢出服务器", args: "<玩家> [原因]", op: true },
  { name: "ban", desc: "封禁玩家", args: "<玩家> [原因]", op: true, danger: true },
  { name: "pardon", desc: "解除封禁", args: "<玩家>", op: true },
  { name: "whitelist", desc: "白名单：on/off/add/remove/list", args: "add <玩家>", op: true },
  { name: "gamemode", desc: "切换游戏模式", args: "survival|creative|adventure|spectator [玩家]", op: true },
  { name: "difficulty", desc: "设置难度", args: "peaceful|easy|normal|hard", op: true },
  { name: "time", desc: "设置时间", args: "set day|night|<数字>", op: true },
  { name: "weather", desc: "设置天气", args: "clear|rain|thunder [时长]", op: true },
  { name: "gamerule", desc: "查看/修改游戏规则", args: "<规则> [值]", op: true },
  { name: "daylight", desc: "昼夜循环开关（部分版本）", args: "on|off", op: true },
  { name: "setworldspawn", desc: "设置世界出生点", args: "[坐标]", op: true },
  { name: "tp", desc: "传送玩家", args: "<玩家> <目标>", op: true },
  { name: "give", desc: "给玩家物品", args: "<玩家> <物品> [数量]", op: true },
  { name: "effect", desc: "添加/移除药水效果", args: "give|clear <玩家> ...", op: true },
  { name: "enchant", desc: "附魔手持物品", args: "<玩家> <附魔> [等级]", op: true },
  { name: "xp", desc: "给予经验", args: "add <玩家> <数量>", op: true },
  { name: "summon", desc: "生成实体", args: "<实体> [坐标]", op: true },
  { name: "execute", desc: "以特定上下文执行指令", args: "as <目标> at @s run ...", op: true },
  { name: "fill", desc: "填充方块", args: "<起点> <终点> <方块>", op: true, danger: true },
  { name: "clone", desc: "复制区域", args: "<起点> <终点> <目标>", op: true, danger: true },
  { name: "setblock", desc: "放置方块", args: "<坐标> <方块>", op: true },
  { name: "save-all", desc: "立即保存世界", args: "[flush]", op: true },
  { name: "save-off", desc: "暂停自动保存（备份前用）", op: true },
  { name: "save-on", desc: "恢复自动保存", op: true },
  { name: "reload", desc: "重载数据包与部分配置", op: true },
  { name: "stop", desc: "保存并关闭服务器", danger: true },
  { name: "seed", desc: "查看世界种子", op: true },
  { name: "spawnpoint", desc: "设置玩家出生点", args: "[玩家] [坐标]", op: true },
  { name: "setidletimeout", desc: "挂机踢出时间（分钟）", args: "<分钟>", op: true },
  { name: "worldborder", desc: "世界边界", args: "set|center|get ...", op: true },
  { name: "datapack", desc: "数据包管理", args: "list|reload|enable|disable", op: true },
  { name: "bossbar", desc: "Boss 血条", args: "add|set|remove ...", op: true },
  { name: "scoreboard", desc: "计分板", args: "objectives|players ...", op: true },
  { name: "tag", desc: "实体标签", args: "<玩家> add|remove <标签>", op: true },
  { name: "me", desc: "以第三人称发言", args: "<动作>" },
  { name: "help", desc: "查看指令帮助", args: "[指令]" },
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
        label: c.args ? `${c.name} ${c.args}` : c.name,
        hint: c.desc,
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
