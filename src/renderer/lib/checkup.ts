/**
 * 客户端体检
 * ------------------------------------------------------------
 * 玩家拿到房间码之后最想知道的一件事：**我这台机器现在能不能进**。
 * 这里只做“读本地”，不发一个字节：版本目录、fabric loader、已有 Mod。
 * 用到的都是通用 fs / mods 通道，所以桌面版和网页版是同一份实现。
 */

import type { RoomDescriptorV1 } from "./room";

export interface VersionCandidate {
  /** versions/ 下的目录名 */
  id: string;
  /** 继承的原版版本（fabric 版本一般写在这里） */
  mcVersion: string;
  loader: "fabric" | "forge" | "neoforge" | "quilt" | "vanilla";
  loaderVersion?: string;
}

export interface CheckupResult {
  dir: string;
  exists: boolean;
  /** 匹配房间版本+加载器的目录名 */
  match: string | null;
  candidates: VersionCandidate[];
  mods: {
    total: number;
    present: number;
    /** 缺的 Mod（房间里的名字） */
    missing: { p: string; v: string; n: string }[];
  };
  verdict: "ready" | "need-mods" | "need-version" | "no-client" | "no-version";
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * 比较键：只保留字母。
 * 玩家的 Mod 文件名常带版本号（sodium-fabric-0.8.9），显示名常带 v26.1 之类的尾巴，
 * 去掉数字与符号之后两边的共同部分最稳定。
 */
function modKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

function detectLoader(libraries: { name?: string }[]): { loader: VersionCandidate["loader"]; loaderVersion?: string } {
  for (const lib of libraries) {
    const name = lib?.name ?? "";
    const fabric = /net\.fabricmc:fabric-loader:([^:]+)/.exec(name);
    if (fabric) return { loader: "fabric", loaderVersion: fabric[1] };
    const quilt = /org\.quiltmc:quilt-loader:([^:]+)/.exec(name);
    if (quilt) return { loader: "quilt", loaderVersion: quilt[1] };
    const neo = /net\.neoforged:neoforge:([^:]+)/.exec(name);
    if (neo) return { loader: "neoforge", loaderVersion: neo[1] };
    const forge = /net\.minecraftforge:forge:([^:]+)/.exec(name);
    if (forge) return { loader: "forge", loaderVersion: forge[1] };
  }
  return { loader: "vanilla" };
}

/** 读一个版本 JSON（缺字段也不炸） */
export function parseVersionJson(id: string, json: Record<string, unknown> | null): VersionCandidate {
  const inherits = typeof json?.inheritsFrom === "string" ? json.inheritsFrom : "";
  const libraries = Array.isArray(json?.libraries) ? (json.libraries as { name?: string }[]) : [];
  const { loader, loaderVersion } = detectLoader(libraries);
  // 没继承时，id 本身可能是 "fabric-loader-0.15-1.21" 或 "1.21-fabric"
  const mcVersion = inherits || String(json?.id ?? id).replace(/-?fabric.*$/i, "").replace(/^fabric.*-/, "");
  return { id, mcVersion, loader, loaderVersion };
}

async function listEntries(dir: string) {
  try {
    return await window.mcss.fs.list(dir);
  } catch {
    return [];
  }
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse((await window.mcss.fs.read(path)).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const join = (base: string, ...parts: string[]) => [base, ...parts].join("\\").replace(/\\\\+/g, "\\");

/** 体检：给定 .minecraft 目录与房间，回答“能不能直接进” */
export async function checkClient(mcDir: string, room: RoomDescriptorV1): Promise<CheckupResult> {
  const versionsDir = join(mcDir, "versions");
  const dirs = (await listEntries(versionsDir)).filter((e) => e.isDir);
  const clientExists = await window.mcss.fs.exists(mcDir).catch(() => false);
  if (!dirs.length) {
    return {
      dir: mcDir,
      exists: clientExists,
      match: null,
      candidates: [],
      mods: { total: room.mods.length, present: 0, missing: room.mods.map((m) => ({ p: m.p, v: m.v, n: m.n ?? m.p })) },
      // 目录在但没装过游戏，和「找不到目录」是两回事，提示要说清楚
      verdict: clientExists ? "no-version" : "no-client",
    };
  }

  const candidates: VersionCandidate[] = [];
  for (const dir of dirs) {
    const json = await readJson(join(dir.path, `${dir.name}.json`));
    candidates.push(parseVersionJson(dir.name, json));
  }

  const match =
    candidates.find((c) => c.loader === room.loader && c.mcVersion === room.mc) ??
    null;

  // Mod 比对：按名字归一化后求交集（宁可说“有”，也不吓唬人）
  let present = 0;
  const missing: { p: string; v: string; n: string }[] = [];
  if (room.mods.length) {
    const localMods = await window.mcss.mods.scan(join(mcDir, "mods")).catch(() => []);
    const localKeys = localMods.map((m) => modKey(m.name || m.file));
    for (const mod of room.mods) {
      const name = mod.n ?? mod.p;
      const key = modKey(name);
      const hit =
        key.length >= 3 &&
        localKeys.some((k) => k.length >= 3 && (k === key || k.includes(key) || key.includes(k)));
      if (hit) present += 1;
      else missing.push({ p: mod.p, v: mod.v, n: name });
    }
  }

  const verdict: CheckupResult["verdict"] = !match ? "need-version" : missing.length ? "need-mods" : "ready";

  return {
    dir: mcDir,
    exists: true,
    match: match?.id ?? null,
    candidates,
    mods: { total: room.mods.length, present, missing },
    verdict,
  };
}

/** 默认客户端目录：%APPDATA%\.minecraft */
export function defaultClientDir(appData: string): string {
  return join(appData, ".minecraft");
}
