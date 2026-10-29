/**
 * Fabric Loader 列表归一化
 * ------------------------------------------------------------
 * 三个外壳（桌面版 preload / 网页版 agent / 打包发布过的旧 agent）对同一个通道
 * 可能给出不同形状：
 *   ["0.16.9", "0.16.8"]                          ← 现在的契约
 *   [{ version: "0.16.9", stable: true }, ...]    ← 27.0.0 及更早吐的形状
 * 渲染层必须只认 string[]：一旦把对象当 React 子节点（<option>{obj}</option>），
 * React 会抛 #31 并**卸载整棵树**，用户看到的就是一面纯黑窗口。
 *
 * 所以这里做两件事：兼容两种历史形状；任何异常值一律丢掉，绝不上抛。
 */
export function normalizeLoaders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    let v: unknown = null;
    if (typeof item === "string") v = item;
    else if (item && typeof item === "object") v = (item as { version?: unknown }).version;
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/** 选中一个仍然存在的值；否则退回列表第一个（列表为空则空串） */
export function pickLoader(current: string, list: string[]): string {
  if (current && list.includes(current)) return current;
  return list[0] ?? "";
}
