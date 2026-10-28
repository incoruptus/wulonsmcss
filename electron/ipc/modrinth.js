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

module.exports = { search, versions, install };
