/**
 * AI 现场包
 * ------------------------------------------------------------
 * 把「出问题时需要看的一切」压成一个 zip：说明、知识库、上下文、日志、脱敏配置。
 * 用户只要把这个文件拖给任意 AI，对方不用再问“你的配置是什么/日志在哪”。
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SECRET_KEYS = ["token", "password", "secret", "gistId", "pairCode", "apiKey"];

/** 去掉令牌与密钥，保留结构（AI 需要看到字段存在，但不需要真值） */
function sanitize(value, depth = 0) {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
        out[k] = v ? "*** REDACTED ***" : v;
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** 日志与文本里可能出现的令牌 */
function redactText(text) {
  return String(text)
    .replace(/(gh[pousr]_[A-Za-z0-9]{10,})/g, "gh***REDACTED")
    .replace(/(github_pat_[A-Za-z0-9_]{10,})/g, "github_pat_***REDACTED")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***REDACTED")
    .replace(/(x-mcss-token["'\s:=]+)([A-Za-z0-9]{8,})/gi, "$1***REDACTED");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function buildReadme({ instance, appVersion }) {
  return `# Wulon's MCSS 排错现场包

生成时间：${new Date().toLocaleString("zh-CN")}
应用版本：${appVersion || "v27"}
实例：${instance?.name ?? "(未知)"} · Minecraft ${instance?.mcVersion ?? "?"} · ${instance?.loader ?? "?"}

## 这是什么

Wulon's MCSS 是本地 Minecraft 服务器管理器（Electron 应用）。这份包是在出问题时导出的现场，
目的是让 AI 或人不用来回追问，就能定位问题。

## 文件说明

| 文件 | 内容 |
|---|---|
| \`context.md\` | 实例信息、症状、预检结果、最近操作 —— **先读这个** |
| \`logs/recent.log\` | 最近的控制台输出（已脱敏） |
| \`config.sanitized.json\` | 应用配置（令牌/密钥已替换为 *** REDACTED ***） |
| \`knowledge.md\` | 常见故障的「症状 → 原因 → 修法」对照表 |

## 希望你（AI）怎么做

1. 先读 \`context.md\`，用一句话复述症状与证据；
2. 对照 \`knowledge.md\` 判断最可能的原因；
3. 给不超过 3 个**可逆**步骤（改名/备份，不要删存档、不要重装系统）；
4. 证据不足就说明还需要哪一段日志，不要猜。

## 隐私

令牌、密钥已被替换为 \`*** REDACTED ***\`；服务器目录等路径是真实路径，便于定位问题。
如果不想暴露路径，可以在粘贴前手动替换。
`;
}

function buildContext({ instance, symptom, preflight, logsCount, extra }) {
  const lines = [];
  lines.push("# 现场");
  lines.push("");
  lines.push("## 实例");
  lines.push(`- 名称：${instance?.name ?? "?"}`);
  lines.push(`- 版本：Minecraft ${instance?.mcVersion ?? "?"} · ${instance?.loader ?? "?"}${instance?.loaderVersion ? ` ${instance.loaderVersion}` : ""}`);
  lines.push(`- 目录：${instance?.dir ?? "?"}`);
  lines.push(`- Java：${instance?.javaPath ?? "(未指定)"}`);
  lines.push(`- 端口：${instance?.port ?? "?"} · 内存上限：${instance?.memoryMax ?? "?"} GB`);
  lines.push(`- JVM 参数：${instance?.jvmArgs || "(无)"}`);
  lines.push(`- 上次启动：${instance?.lastStartedAt ? new Date(instance.lastStartedAt).toLocaleString("zh-CN") : "从未"}`);

  if (symptom) {
    lines.push("");
    lines.push("## 用户描述的症状");
    lines.push(symptom.title || "");
    if (symptom.detail) lines.push("", symptom.detail);
  }

  if (Array.isArray(preflight) && preflight.length) {
    lines.push("");
    lines.push("## 开服前预检结果");
    for (const item of preflight) {
      lines.push(`- [${item.level}] ${item.title}${item.detail ? `：${item.detail}` : ""}`);
    }
  }

  if (extra) {
    lines.push("");
    lines.push("## 其它");
    for (const [k, v] of Object.entries(extra)) lines.push(`- ${k}：${v}`);
  }

  lines.push("");
  lines.push(`日志共 ${logsCount} 行，见 \`logs/recent.log\`。`);
  return lines.join("\n");
}

/**
 * @param {object} opts
 * @param {string} opts.outFile
 * @param {object} opts.instance
 * @param {string[]} opts.logs        最近日志行
 * @param {object} [opts.symptom]     { title, detail }
 * @param {Array} [opts.preflight]
 * @param {object} [opts.config]      已读出的完整配置（内部会脱敏）
 * @param {string} [opts.docsDir]     知识库目录
 * @param {string} [opts.appVersion]
 */
function exportBundle({ outFile, instance, logs = [], symptom, preflight, config, docsDir, appVersion }) {
  if (!outFile) throw new Error("缺少导出路径");
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-diag-"));
  try {
    fs.mkdirSync(path.join(stage, "logs"), { recursive: true });

    fs.writeFileSync(path.join(stage, "README.md"), buildReadme({ instance, appVersion }));
    fs.writeFileSync(
      path.join(stage, "context.md"),
      buildContext({ instance, symptom, preflight, logsCount: logs.length })
    );

    const tail = logs.slice(-500).map((l) => redactText(l));
    fs.writeFileSync(path.join(stage, "logs", "recent.log"), tail.join("\n"));

    if (config) {
      fs.writeFileSync(path.join(stage, "config.sanitized.json"), JSON.stringify(sanitize(config), null, 2));
    }

    // 知识库：优先用打包/仓库里的，找不到就给个占位说明
    const knowledgeSrc = docsDir ? path.join(docsDir, "knowledge.md") : null;
    if (knowledgeSrc && fs.existsSync(knowledgeSrc)) {
      fs.copyFileSync(knowledgeSrc, path.join(stage, "knowledge.md"));
    } else {
      fs.writeFileSync(path.join(stage, "knowledge.md"), "# 知识库缺失\n\n请人工检查常见故障：端口占用、Java 版本、内存不足、数据包格式、Mod 依赖。\n");
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      appVersion: appVersion || "v27",
      instance: instance?.name ?? null,
      files: fs.readdirSync(stage, { recursive: true }).map(String),
    };
    fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    } catch (e) {}

    execFileSync("tar", ["-a", "-c", "-f", outFile, ...fs.readdirSync(stage)], {
      cwd: stage,
      timeout: 60_000,
    });

    return { ok: true, file: outFile, size: fs.statSync(outFile).size, logs: tail.length };
  } finally {
    try {
      fs.rmSync(stage, { recursive: true, force: true });
    } catch (e) {}
  }
}

module.exports = { exportBundle, sanitize, redactText, defaultName: () => `mcss-diag-${stamp()}.zip` };
