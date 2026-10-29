/**
 * 配置读写与结构迁移
 * - v26 → v27：把扁平的 serverPath/javaPath/maxMemory 收敛成「实例列表」
 * - v27 → v28：语义迁移在渲染层做（src/renderer/lib/config-model.ts），
 *   因为网页版的 agent 用的是另一套落盘实现。壳只负责「读一份 JSON、写回一份 JSON」，
 *   绝不能擅自判断版本号或重建字段——否则两边行为会分叉。
 * - 写入采用「读取→合并→落盘」，避免多路写入丢字段
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_ACCENT = "#2f6feb";

/** 壳认识的最高结构版本；看不懂的更高版本原样透传（向前兼容） */
const SCHEMA_VERSION = 28;

function defaultConfig() {
  return {
    version: SCHEMA_VERSION,
    theme: "dark",
    accent: DEFAULT_ACCENT,
    instances: [],
    activeInstanceId: null,
    consoleViewMode: "code",
    maxLogLines: 1000,
    animationsEnabled: true,
    setupComplete: false,
    quickActions: [],
    frpProfiles: [],
    sync: null,
    detectedJava: null
  };
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(stripBom(fs.readFileSync(file, "utf-8")));
  } catch (e) {
    return null;
  }
}

/** v26 扁平配置 → v27 实例化配置 */
function migrate(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  // v27 及以后都是「实例列表」结构：原样透传，语义迁移归渲染层
  if (Number(raw.version) >= 27 && Array.isArray(raw.instances)) return { ...base, ...raw };

  const instances = [];
  if (raw.serverPath) {
    const now = Date.now();
    instances.push({
      id: "legacy",
      name: path.basename(String(raw.serverPath)) || "我的服务器",
      dir: String(raw.serverPath),
      mcVersion: String(raw.mcVersion || "26.1"),
      loader: raw.loader === "vanilla" ? "vanilla" : "fabric",
      loaderVersion: raw.loaderVersion || undefined,
      javaPath: String(raw.javaPath || ""),
      memoryMin: Number(raw.initMemory) || 2,
      memoryMax: Number(raw.maxMemory) || 4,
      jvmArgs: String(raw.jvmArgs || ""),
      port: Number(raw.port) || 25565,
      createdAt: now,
      updatedAt: now
    });
  }

  const theme = raw.theme === "light" ? "light" : raw.theme === "auto" || raw.theme === "system" ? "system" : "dark";

  return {
    ...base,
    theme,
    accent: typeof raw.accent === "string" ? raw.accent : typeof raw.primaryColor === "string" ? raw.primaryColor : DEFAULT_ACCENT,
    instances,
    activeInstanceId: instances[0]?.id ?? null,
    consoleViewMode: raw.consoleViewMode === "bubble" ? "bubble" : "code",
    maxLogLines: Number(raw.maxLogLines) || 1000,
    animationsEnabled: raw.animationsEnabled !== false,
    setupComplete: Boolean(raw.setupComplete) || instances.length > 0,
    quickActions: Array.isArray(raw.quickActions) ? raw.quickActions : [],
    frpProfiles: [],
    sync: null,
    detectedJava: typeof raw.detectedJava === "string" ? raw.detectedJava : null
  };
}

function createConfigStore(configPath) {
  function persist(cfg) {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
    } catch (e) {
      /* 只读环境（如安装目录）下不阻断启动 */
    }
  }

  function read() {
    const raw = readJson(configPath);
    const cfg = migrate(raw);
    // 只对真正的老结构（v26 及以前）落盘；v27/v28 的字段补全由渲染层负责
    if (raw && Number(raw.version) < 27) persist(cfg);
    return cfg;
  }

  function write(patch) {
    const current = read();
    // 版本号由渲染层（config-model）唯一决定，壳不许改写成自己的常量
    const next = { ...current, ...patch };
    persist(next);
    return next;
  }

  function reset() {
    try {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    } catch (e) {}
  }

  return { read, write, reset };
}

module.exports = { createConfigStore, defaultConfig, migrate, DEFAULT_ACCENT, SCHEMA_VERSION };
