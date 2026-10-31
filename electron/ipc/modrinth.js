/**
 * Modrinth 资源库：搜索 / 版本列表 / 下载安装
 * 文档：https://docs.modrinth.com/api/
 */

const fs = require("fs");
const path = require("path");
const { download } = require("./versions");

const API = "https://api.modrinth.com/v2";
/** 国内直连 api.modrinth.com 经常抖；MCIM 是同一套 API 结构的镜像，失败时兜底 */
const MCIM = "https://mod.mcimirror.top";
const API_BASES = [API, `${MCIM}/modrinth/v2`];
const UA = "WulonsMCSS/28.0.0 (+https://github.com/wulons)";

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 相对路径 → 先官方、再 MCIM；绝对 URL 只请求一次 */
async function getJson(pathOrUrl, timeoutMs = 15000) {
  if (/^https?:\/\//i.test(pathOrUrl)) return fetchJson(pathOrUrl, timeoutMs);
  let lastErr;
  for (const base of API_BASES) {
    try {
      return await fetchJson(base + pathOrUrl, timeoutMs);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`无法连接 Modrinth，官方接口与镜像均失败：${lastErr?.message || "未知错误"}`);
}

/* ----------------------------- 简介翻译缓存 ----------------------------- */

const translateCache = new Map(); // key -> { value, at }
const TRANSLATE_TTL = 6 * 3600_000;

function cacheGet(key) {
  const hit = translateCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TRANSLATE_TTL) {
    translateCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (translateCache.size > 400) {
    // 简单 LRU：删掉最早插入的一批
    for (const k of [...translateCache.keys()].slice(0, 80)) translateCache.delete(k);
  }
  translateCache.set(key, { value, at: Date.now() });
}

function buildFacets({ mcVersion, loader, projectType = "mod", categories = [], environment }) {
  const facets = [[`project_type:${projectType}`]];
  if (loader) facets.push([`categories:${loader}`]);
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  if (Array.isArray(categories) && categories.length) {
    // 同一个数组内是 OR，数组之间是 AND
    facets.push(categories.map((c) => `categories:${c}`));
  }
  if (environment === "client") facets.push(["client_side:required"]);
  if (environment === "server") facets.push(["server_side:required"]);
  if (environment === "both") {
    facets.push(["client_side:required"]);
    facets.push(["server_side:required"]);
  }
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
  const data = await getJson(`/search?${params.toString()}`);
  return {
    total: data.total_hits ?? 0,
    hits: (data.hits ?? []).map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      iconUrl: h.icon_url || undefined,
      downloads: h.downloads ?? 0,
      follows: h.follows ?? 0,
      author: h.author,
      categories: h.categories ?? [],
      gameVersions: h.versions ?? [],
      clientSide: h.client_side || undefined,
      serverSide: h.server_side || undefined,
      license: h.license || undefined,
      dateModified: h.date_modified || undefined,
      projectType: h.project_type || opts.projectType || "mod"
    }))
  };
}

/** 项目详情：搜索页点开一个项目时用 */
async function project(projectId) {
  if (!projectId) throw new Error("缺少项目 id");
  const p = await getJson(`/project/${encodeURIComponent(projectId)}`);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description || "",
    body: p.body || "",
    categories: p.categories ?? [],
    additionalCategories: p.additional_categories ?? [],
    clientSide: p.client_side || undefined,
    serverSide: p.server_side || undefined,
    downloads: p.downloads ?? 0,
    followers: p.followers ?? 0,
    iconUrl: p.icon_url || undefined,
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    published: p.published,
    updated: p.updated,
    license: p.license || undefined,
    sourceUrl: p.source_url || undefined,
    issuesUrl: p.issues_url || undefined,
    wikiUrl: p.wiki_url || undefined,
    discordUrl: p.discord_url || undefined,
    projectType: p.project_type || "mod",
    loaders: p.loaders ?? [],
    gameVersions: p.game_versions ?? []
  };
}

/** 中文简介：MCIM 的机器翻译（只翻简介，不翻正文） */
async function translateProject(projectId) {
  if (!projectId) return null;
  const key = `p:${projectId}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;
  let value = null;
  try {
    const data = await fetchJson(
      `${MCIM}/translate/modrinth?project_id=${encodeURIComponent(projectId)}`,
      12000
    );
    if (data && typeof data.translated === "string" && data.translated.trim()) {
      value = {
        translated: data.translated.trim(),
        original: typeof data.original === "string" ? data.original : "",
        at: data.translated_at || undefined,
        engine: "mcim"
      };
    }
  } catch {
    // 没有中文简介不是什么错误：界面回退英文原文
    value = null;
  }
  cacheSet(key, value);
  return value;
}

/* ------------------------------- 机翻 ------------------------------- */

function cjkRatio(text) {
  const chars = [...text];
  if (!chars.length) return 0;
  const cjk = chars.filter((c) => /[\u3400-\u9fff]/.test(c)).length;
  return cjk / chars.length;
}

function splitChunks(text, max) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    let rest = line;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max * 0.5) cut = max;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    out.push(rest);
  }
  return out;
}

async function viaMyMemory(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${source}|${target}`)}`;
  const data = await fetchJson(url, 12000);
  const translated = data?.responseData?.translatedText;
  if (typeof translated !== "string" || !translated.trim()) throw new Error("MyMemory 未返回译文");
  if (/MYMEMORY WARNING/i.test(translated)) throw new Error("MyMemory 今日翻译额度已用尽");
  return translated;
}

async function viaGoogle(text, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const data = await fetchJson(url, 8000);
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("Google 返回格式不对");
  return data[0].map((seg) => (Array.isArray(seg) ? seg[0] : "")).join("");
}

/**
 * 任意文本机翻：MyMemory 为主（国内可达），Google 兜底。
 * 长文本按行/句切块，避免超出免费接口的单次长度限制。
 */
async function translateText(text, opts = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return { text: "", engine: "none", truncated: false };
  const target = opts.to || (cjkRatio(raw) > 0.2 ? "en" : "zh-CN");
  const source = opts.from || (target === "en" ? "zh-CN" : "en");
  const truncated = raw.length > 3000;
  const input = truncated ? raw.slice(0, 3000) : raw;
  const key = `t:${source}:${target}:${input}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const chunks = splitChunks(input, 450);
  const out = [];
  let engine = "mymemory";
  for (const chunk of chunks) {
    if (!chunk.trim()) {
      out.push(chunk);
      continue;
    }
    let piece;
    try {
      piece = await viaMyMemory(chunk, source, target);
    } catch {
      engine = "google";
      piece = await viaGoogle(chunk, target);
    }
    out.push(piece);
  }
  const result = { text: out.join("\n"), engine, truncated };
  cacheSet(key, result);
  return result;
}

async function versions(projectId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.loader) params.set("loaders", JSON.stringify([opts.loader]));
  if (opts.mcVersion) params.set("game_versions", JSON.stringify([opts.mcVersion]));
  const qs = params.toString();
  const list = await getJson(`/project/${encodeURIComponent(projectId)}/version${qs ? `?${qs}` : ""}`);
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

/** 下载到 <dir>/mods 或 <dir>/plugins（看 kind），返回落盘路径 */
async function install({ dir, fileUrl, fileName, kind, onProgress }) {
  if (!dir) throw new Error("缺少安装目录");
  if (!/^https:\/\//.test(fileUrl)) throw new Error("下载地址不合法");
  const safe = String(fileName || "mod.jar").replace(/[\\/:*?"<>|]+/g, "_");
  const subdir = kind === "plugin" ? "plugins" : "mods";
  const dest = path.join(dir, subdir, safe);
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
      const p = await getJson(`/project/${encodeURIComponent(id)}`);
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
      const found = await getJson(`/search?${params.toString()}`);
      for (const hit of found.hits || []) {
        candidates.push({ id: hit.project_id, title: hit.title, slug: hit.slug });
      }
    } catch (e) {}
  }

  for (const project of candidates) {
    let versions = [];
    try {
      versions = await getJson(`/project/${project.id}/version`);
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

module.exports = { search, project, translateProject, translateText, versions, install, resolveByModId, resolveMany };
