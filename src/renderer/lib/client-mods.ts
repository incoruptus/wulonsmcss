import type { ModMeta } from "./types";

/**
 * 把「我客户端里已有的 Mod」同步到服务端。
 * ------------------------------------------------------------
 * 优先按 Modrinth 的项目/版本重新下载（可写进邀请码，朋友也能自动拉齐）；
 * 找不到 Modrinth 条目（CurseForge 独占、手改包）就直接复制本地 jar，
 * 至少保证服务端和客户端是同一份文件。
 */
export interface ClientModSyncResult {
  downloaded: string[];
  copied: string[];
  failed: { file: string; error: string }[];
  /** 服务端文件名 → Modrinth 描述符，用于邀请码/进服包 */
  index: Record<string, { p: string; v: string; n?: string }>;
}

function baseName(file: string): string {
  return String(file || "mod.jar").split(/[\\/]/).pop() || "mod.jar";
}

export async function resolveClientMods(mods: ModMeta[]): Promise<Map<string, { p: string; v: string; n: string }>> {
  const out = new Map<string, { p: string; v: string; n: string }>();
  if (!mods.length) return out;
  const resolved = await window.mcss.mods.resolveModrinth(
    mods.map((m) => ({ id: m.id, file: m.file, version: m.version })),
  );
  for (const r of resolved) {
    if (r.p && r.v) out.set(r.file, { p: r.p, v: r.v, n: r.n || r.file });
  }
  return out;
}

export async function syncClientMods(serverDir: string, mods: ModMeta[]): Promise<ClientModSyncResult> {
  const result: ClientModSyncResult = { downloaded: [], copied: [], failed: [], index: {} };
  if (!mods.length) return result;
  const modsDir = `${serverDir}\\mods`;
  await window.mcss.fs.mkdir(modsDir);

  let matched = new Map<string, { p: string; v: string; n: string }>();
  try {
    matched = await resolveClientMods(mods);
  } catch {
    // 匹配服务不可用也不阻塞：全部退回本地复制
  }

  const remote = mods.filter((m) => matched.has(m.file));
  const remoteByName = new Map(remote.map((m) => [matched.get(m.file)!.n, m.file]));
  if (remote.length) {
    const res = await window.mcss.client
      .prepare({
        dir: serverDir,
        mods: remote.map((m) => {
          const hit = matched.get(m.file)!;
          return { p: hit.p, v: hit.v, n: hit.n };
        }),
      })
      .catch((e: Error) => ({ ok: false, error: e.message, results: [] as { ok: boolean; name: string; file?: string; error?: string }[] }));

    for (const r of res.results ?? []) {
      if (r.ok && r.file) {
        result.downloaded.push(r.file);
        const source = remoteByName.get(r.name);
        const hit = source ? matched.get(source) : null;
        if (hit) result.index[r.file] = hit;
      }
    }
    if (!res.ok && !res.results?.length) {
      // 整个下载器起不来，所有 remote 都走本地复制
    }
  }

  const remoteFiles = new Set(result.downloaded);
  for (const mod of mods) {
    if (remoteFiles.has(baseName(mod.file))) continue;
    // 远程失败/没匹配到：复制客户端本地文件
    const file = baseName(mod.file);
    try {
      await window.mcss.fs.copy(mod.path, `${modsDir}\\${file}`);
      result.copied.push(file);
    } catch (e) {
      result.failed.push({ file, error: (e as Error).message });
    }
  }

  return result;
}
