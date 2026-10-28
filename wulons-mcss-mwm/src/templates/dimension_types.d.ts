/** 类型声明：维度类型模板表 */

export interface DimensionTemplate {
  generator: string;
  preset?: string;
  type: Record<string, unknown>;
}

export const TYPE_MAP: Record<string, DimensionTemplate>;
export function inferTypeFromDimension(dimension: unknown): string;
