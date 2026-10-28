/**
 * Modrinth 资源库：搜索 / 版本列表 / 下载安装
 * 文档：https://docs.modrinth.com/api/
 */

const fs = require("fs");
const path = require("path");
const { download } = require("./versions");

const API = "https://api.modrinth.com/v2";
const UA = "WulonsMCSS/27.0.0 (github.com/wulons)";

async function getJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Modrinth HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildFacets({ mcVersion, loader, projectType = "mod" }) {
  const facets = [[`project_type:${projectType}`]];
  if (loader) facets.push([`categories:${loader}`]);
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  return facets;
}

async function search(q, opts = {}) {
  const params = new URLSearchParams({
    query: q || "",
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
    index: opts.sort ?? "relevance"
  });
  const facets = buildFacets(opts);
  params.set("facets", JSON.stringify(facets));
  const data = await getJson(`${API}/search?${params.toString()}`);
  return {
    total: data.total_hits ?? 0,
    hits: (data.hits ?? []).map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      iconUrl: h.icon_url || undefined,
      downloads: h.downloads ?? 0,
      author: h.author,
      categories: h.categories ?? []
    }))
  };
}

async function versions(projectId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.loader) params.set("loaders", JSON.stringify([opts.loader]));
  if (opts.mcVersion) params.set("game_versions", JSON.stringify([opts.mcVersion]));
  const url = `${API}/project/${encodeURIComponent(projectId)}/version${params.toString() ? `?${params}` : ""}`;
  const list = await getJson(url);
  return list.map((v) => ({
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    gameVersions: v.game_versions ?? [],
    loaders: v.loaders ?? [],
    datePublished: v.date_published,
    files: (v.files ?? []).map((f) => ({
      url: f.url,
      filename: f.filename,
      size: f.size,
      primary: Boolean(f.primary)
    }))
  }));
}

/** 下载到 <dir>/mods/，返回落盘路径 */
async function install({ dir, fileUrl, fileName, onProgress }) {
  if (!dir) throw new Error("缺少安装目录");
  if (!/^https:\/\//.test(fileUrl)) throw new Error("下载地址不合法");
  const safe = String(fileName || "mod.jar").replace(/[\\/:*?"<>|]+/g, "_");
  const dest = path.join(dir, "mods", safe);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await download(fileUrl, dest, (got, total) => onProgress?.(got, total));
  return { ok: true, path: dest };
}

/**
 * 给「本地手动装的 Mod」反查 Modrinth 版本。
 * 两条路：
 *   1) 直接把 fabric.mod.json 的 id 当 slug 查项目（sodium / fabric-api …）
 *   2) 查不到就用显示名搜索，并对候选逐个核对「文件名完全一致」才认
 *      （文件名是最硬的证据，避免搜到同名的另一个 Mod）
 */
async function resolveByModId({ id, file, version, name }) {
  const candidates = [];

  if (id) {
    try {
      const p = await getJson(`${API}/project/${encodeURIComponent(id)}`);
      if (p?.id) candidates.push(p);
    } catch (e) {}
  }

  if (!candidates.length && name) {
    try {
      const params = new URLSearchParams({
        query: name,
        limit: "3",
        facets: JSON.stringify([["project_type:mod"]]),
      });
      const found = await getJson(`${API}/search?${params.toString()}`);
      for (const hit of found.hits || []) {
        candidates.push({ id: hit.project_id, title: hit.title, slug: hit.slug });
      }
    } catch (e) {}
  }

  for (const project of candidates) {
    let versions = [];
    try {
      versions = await getJson(`${API}/project/${project.id}/version`);
    } catch (e) {
      continue;
    }
    if (!Array.isArray(versions)) continue;
    const byFile = versions.find((v) => (v.files || []).some((f) => f.filename === file));
    const byVersion = versions.find((v) => v.version_number === version);
    const hit = byFile || byVersion;
    if (hit) {
      return {
        p: project.id,
        v: hit.id,
        n: project.title,
        matched: byFile ? "file" : "version",
      };
    }
  }
  return null;
}

/** 批量反查（并发 4，单条失败不影响其它） */
async function resolveMany(list) {
  const out = [];
  const queue = [...list];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      try {
        const hit = await resolveByModId(item);
        if (hit) out.push({ file: item.file, ...hit });
      } catch (e) {}
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { search, versions, install, resolveByModId, resolveMany };
