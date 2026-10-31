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
  return `# Wulon's MCSS 故障诊断包

生成时间：${new Date().toLocaleString("zh-CN")}
应用版本：${appVersion || "v27"}
服务器实例：${instance?.name ?? "(未知)"} · Minecraft ${instance?.mcVersion ?? "?"} · ${instance?.loader ?? "?"}

## 诊断包说明

Wulon's MCSS 是一款本地 Minecraft 服务器管理工具。此压缩包在服务器出现故障时导出，汇总了运行环境与日志上下文，便于快速定位问题原因。

## 文件清单

| 文件 | 说明 |
|---|---|
| \`context.md\` | 实例配置、故障现象、开服前预检结果及近期操作记录（**请优先阅读**） |
| \`logs/recent.log\` | 近期控制台输出日志（敏感信息已脱敏） |
| \`config.sanitized.json\` | 应用配置文件（令牌与密钥已替换为 \`*** REDACTED ***\`） |
| \`knowledge.md\` | 常见故障的「现象 → 原因 → 解决方案」速查表 |

## 排查步骤建议（供 AI 参考）

1. 优先阅读 \`context.md\`，结合日志概述故障现象与关键报错依据；
2. 对照 \`knowledge.md\` 排查最可能的故障原因；
3. 提供不超过 3 个可安全回退的修复步骤（优先采取修改配置或备份后操作，避免直接删除存档）；
4. 若现有日志不足以定位问题，请明确指出还需补充哪类日志信息。

## 隐私说明

配置文件中的令牌与密钥已自动替换为 \`*** REDACTED ***\`。为便于排查路径相关故障，包内保留了服务器目录的真实路径；如需隐藏本地路径，可在发送前手动替换。
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
  lines.push(`共截取 ${logsCount} 行日志，详见 \`logs/recent.log\`。`);
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
