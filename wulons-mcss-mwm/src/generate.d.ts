/** 类型声明：让 TypeScript 能安全地复用这个纯 JS 生成器 */

export interface MwmWorld {
  name: string;
  label?: string;
  description?: string;
  type?: string;
  namespace?: string;
  seed?: number;
  structures?: boolean;
  biome_preset?: string;
  biomes?: string[];
  single_biome?: string;
  noise_settings?: string;
  layers?: { block: string; height: number }[];
}

export function presetBiomes(preset: string): string[];
export function buildDimension(world: MwmWorld): Record<string, unknown>;
export function normalizeDimension(dimension: unknown): Record<string, unknown>;
