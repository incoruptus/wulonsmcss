/**
 * Gist 传输
 * ------------------------------------------------------------
 * - api.github.com 直连可用且 CORS 齐全；secret gist ≠ 私密 → 一律上传密文
 * - 单文件 > 460KB 自动分片：主文件存分片清单，part-N 存内容（规避 API 1MB 截断）
 * - 读取走 API JSON（raw.githubusercontent.com 国内不通）
 */

import { pairIdOf } from "./crypto";
import { quickHash, stableJson } from "./pack";
import type { SyncConfig } from "./types";

const API = "https://api.github.com";
export const GIST_FILE_MAIN = "wulons-mcss-sync.json";
export const GIST_CHUNK_CHARS = 460_000;
const DESCRIPTION_PREFIX = "WulonsMCSS 跨端同步";

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

export interface GistPullResult {
  text: string;
  revision: string;
  fileNames: string[];
}

export function splitEnvelopeForGist(text: string): { main: string; parts: string[] } | null {
  if (text.length <= GIST_CHUNK_CHARS) return null;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += GIST_CHUNK_CHARS) parts.push(text.slice(i, i + GIST_CHUNK_CHARS));
  const main = stableJson({
    format: "wulons-mcss-sync-chunks",
    version: 1,
    parts: parts.length,
    checksum: quickHash(text),
  });
  return { main, parts };
}

export function isChunkManifest(mainText: string): boolean {
  try {
    return (JSON.parse(mainText) as { format?: unknown })?.format === "wulons-mcss-sync-chunks";
  } catch {
    return false;
  }
}

function chunkName(i: number): string {
  return `wulons-mcss-sync.part-${i}`;
}

export function joinGistParts(mainText: string, parts: (string | undefined)[]): string {
  const m = JSON.parse(mainText) as { format: string; version: number; parts: number; checksum: string };
  if (m.format !== "wulons-mcss-sync-chunks" || m.version !== 1) throw new Error("同步分片清单格式异常");
  const missing = [...Array(m.parts).keys()].filter((i) => typeof parts[i] !== "string");
  if (missing.length) throw new Error(`同步分片不完整，缺少 ${missing.length} 个分片，另一端可能尚未上传完成`);
  const text = parts.slice(0, m.parts).join("");
  if (quickHash(text) !== m.checksum) throw new Error("同步分片校验和不一致，请稍后重新同步");
  return text;
}

function mapStatus(status: number): string {
  if (status === 401) return "GitHub Token 无效或已过期，请重新生成后粘贴";
  if (status === 404) return "未找到同步仓库，可能已被删除，请点击「重新创建」";
  if (status === 403 || status === 429) return "GitHub 接口触发限流，请稍后几分钟重试";
  if (status === 422) return "GitHub 拒绝了本次写入，内容可能超出限制";
  return `GitHub 返回了 ${status}`;
}

async function request(cfg: SyncConfig, path: string, init: RequestInit = {}, ms = 25_000): Promise<unknown> {
  const { signal, done } = withTimeout(ms);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/abort|timeout/i.test(msg)) throw new Error("连接 GitHub 超时，请稍后重试");
    throw new Error("无法连接 GitHub，请检查网络或代理设置");
  } finally {
    done();
  }
  if (!res.ok) throw new Error(mapStatus(res.status));
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    throw new Error("GitHub 返回的内容无法解析");
  }
}

interface GistFile {
  content?: string;
}
interface GistResponse {
  id: string;
  updated_at: string;
  files?: Record<string, GistFile | null>;
}

export interface GistPushResult {
  gistId: string;
  revision: string;
}

export async function gistPush(
  cfg: SyncConfig,
  envelopeText: string,
  opts: { existingFiles?: string[] } = {},
): Promise<GistPushResult> {
  const split = splitEnvelopeForGist(envelopeText);
  const files: Record<string, { content: string } | null> = {};
  if (split) {
    files[GIST_FILE_MAIN] = { content: split.main };
    split.parts.forEach((p, i) => {
      files[chunkName(i)] = { content: p };
    });
  } else {
    files[GIST_FILE_MAIN] = { content: envelopeText };
  }
  const keep = new Set(Object.keys(files));
  for (const name of opts.existingFiles ?? []) {
    if (name.startsWith("wulons-mcss-sync.part-") && !keep.has(name)) files[name] = null;
  }
  const body = JSON.stringify({
    description: `${DESCRIPTION_PREFIX} · ${pairIdOf(cfg.pairCode)}`,
    files,
  });
  const gist = (await request(cfg, cfg.gistId ? `/gists/${cfg.gistId}` : "/gists", {
    method: cfg.gistId ? "PATCH" : "POST",
    body,
  })) as GistResponse;
  return { gistId: gist.id, revision: gist.updated_at };
}

export async function gistPull(cfg: SyncConfig): Promise<GistPullResult | null> {
  if (!cfg.gistId) return null;
  const gist = (await request(cfg, `/gists/${cfg.gistId}`)) as GistResponse;
  const files = gist.files ?? {};
  const main = files[GIST_FILE_MAIN]?.content;
  if (typeof main !== "string") return null;
  const fileNames = Object.keys(files);
  if (isChunkManifest(main)) {
    const manifest = JSON.parse(main) as { parts: number };
    const parts = [...Array(manifest.parts).keys()].map((i) => files[chunkName(i)]?.content);
    return { text: joinGistParts(main, parts), revision: gist.updated_at, fileNames };
  }
  return { text: main, revision: gist.updated_at, fileNames };
}

export interface GistCandidate {
  id: string;
  updatedAt: string;
  exact: boolean;
}

/**
 * 在账号里发现「本配对」的中转站：任一设备创建、其余设备认领共用。
 * 若不认领，每台设备都会新建自己的 Gist，配对永远不相遇。
 */
export async function gistFind(cfg: SyncConfig): Promise<GistCandidate[]> {
  const list = (await request(cfg, "/gists?per_page=100")) as Array<{
    id: string;
    description?: string | null;
    updated_at: string;
    files?: Record<string, unknown> | null;
  }>;
  const tag = pairIdOf(cfg.pairCode);
  const exclude = new Set(cfg.excludeGistIds ?? []);
  return list
    .filter((g) => g.files && GIST_FILE_MAIN in g.files && !exclude.has(g.id))
    .map((g) => ({ id: g.id, updatedAt: g.updated_at, exact: (g.description ?? "").includes(tag) }))
    .sort((a, b) => (a.exact !== b.exact ? (a.exact ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1));
}
