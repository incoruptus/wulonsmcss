/**
 * 把单人存档复制进新服务器的 world 目录。
 *
 * 只负责文件动作，便于在 Node 测试里用临时目录验证：
 * - 目标 world 已存在时拒绝，避免覆盖
 * - 复制后删掉单人存档的 session.lock，否则服务端会认为存档被占用
 * - 原存档保留，不做移动
 */

export interface SaveFileApi {
  exists(path: string): Promise<boolean>;
  copy(src: string, dest: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
}

function join(base: string, child: string): string {
  const trimmed = base.replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${child}`;
}

export async function importSinglePlayerSave(
  api: SaveFileApi,
  savePath: string,
  serverDir: string,
): Promise<{ worldDir: string }> {
  const worldDir = join(serverDir, "world");
  if (await api.exists(worldDir)) {
    throw new Error("服务端目录里已经有 world，请先备份或移除它，再重新导入存档");
  }
  await api.copy(savePath, worldDir);
  const lock = join(worldDir, "session.lock");
  if (await api.exists(lock)) await api.remove(lock);
  return { worldDir };
}
