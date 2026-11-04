/**
 * 多世界数据包生成 —— 纯计算，不碰文件系统
 * ------------------------------------------------------------
 * 直接复用 `wulons-mcss-mwm` 的生成器：桌面版、网页版、CLI 三处跑的是同一份代码，
 * 26.x 的 schema 只需要在一个地方改。
 */

import { buildDimension, normalizeDimension, type MwmWorld } from "../../../wulons-mcss-mwm/src/generate.js";
import { buildPackMeta } from "../../../wulons-mcss-mwm/src/templates/pack_mcmeta.js";
import { TYPE_MAP, inferTypeFromDimension } from "../../../wulons-mcss-mwm/src/templates/dimension_types.js";
import { tGlobal } from "../i18n/core";

export interface WorldConfig extends MwmWorld {
  name: string;
  type: string;
  namespace?: string;
}

export interface PackFile {
  /** 相对数据包根目录的路径，用 / 分隔 */
  path: string;
  content: string;
}

export interface GeneratedPack {
  packName: string;
  files: PackFile[];
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** 生成单个世界的数据包（pack.mcmeta + dimension_type + dimension） */
export function buildWorldPack(world: WorldConfig, namespace = "wulons"): GeneratedPack {
  const packName = `mwm-${namespace}-${world.name}`;
  const label = world.label || world.name;
  const template = TYPE_MAP[world.type || "overworld"];
  if (!template) throw new Error(tGlobal("mwm.err.unknownType", "未知的世界类型: {type}", { type: world.type }));

  const files: PackFile[] = [
    { path: "pack.mcmeta", content: json(buildPackMeta(label, world.description)) },
    { path: `data/${namespace}/dimension_type/${world.name}.json`, content: json(template.type) },
    { path: `data/${namespace}/dimension/${world.name}.json`, content: json(buildDimension({ ...world, namespace })) },
  ];

  return { packName, files };
}

/** 合并包：所有世界放进一个数据包 + README（CLI 也会生成，保持一致） */
export function buildMegaPack(worlds: WorldConfig[], namespace = "wulons"): GeneratedPack {
  const packName = `mwm-${namespace}-all`;
  const files: PackFile[] = [];

  for (const world of worlds) {
    const template = TYPE_MAP[world.type || "overworld"];
    if (!template) throw new Error(tGlobal("mwm.err.unknownType", "未知的世界类型: {type}", { type: world.type }));
    files.push({ path: `data/${namespace}/dimension_type/${world.name}.json`, content: json(template.type) });
    files.push({
      path: `data/${namespace}/dimension/${world.name}.json`,
      content: json(buildDimension({ ...world, namespace })),
    });
  }

  files.push({ path: "pack.mcmeta", content: json(buildPackMeta("全部世界", "Wulon's MCSS 多世界管理数据包")) });
  files.push({ path: "README.txt", content: buildReadme(worlds, namespace) });
  return { packName, files };
}

function buildReadme(worlds: WorldConfig[], namespace: string): string {
  const first = worlds[0] ? `${worlds[0].namespace || namespace}:${worlds[0].name}` : "<namespace>:<world>";
  return `# Wulon's MCSS Multi-World 数据包

生成器：wulons-mcss-mwm v26.1.0
包含的世界：
${worlds.map((w) => `- \`${w.namespace || namespace}:${w.name}\` — ${w.label || w.name} (${w.type || "overworld"})`).join("\n")}

## 安装
将本数据包放入 \`world/datapacks/\` 目录，然后执行 \`/reload\` 即可加载。

## 传送
\`/execute in ${first} run tp @s ~ ~ ~\`
`;
}

/** 修复旧包时用：判断某个 dimension JSON 应该套哪种模板 */
export function templateFor(dimension: unknown) {
  const kind = inferTypeFromDimension(dimension);
  return { kind, type: (TYPE_MAP[kind] ?? TYPE_MAP.overworld).type };
}

export { buildDimension, normalizeDimension, TYPE_MAP, inferTypeFromDimension, buildPackMeta };
