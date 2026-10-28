const { test } = require("node:test");
const assert = require("node:assert");
const { sanitize, redactText, exportBundle } = require("./aidiag.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

test("配置里的令牌被替换", () => {
  const out = sanitize({ token: "abc", sync: { gistToken: "x" }, instances: [{ name: "A", apiKey: "k" }] });
  assert.equal(out.token, "*** REDACTED ***");
  assert.equal(out.sync.gistToken, "*** REDACTED ***");
  assert.equal(out.instances[0].apiKey, "*** REDACTED ***");
  assert.equal(out.instances[0].name, "A");
});

test("普通字段原样保留", () => {
  const out = sanitize({ theme: "dark", instances: [{ dir: "D:/srv", port: 25565 }] });
  assert.equal(out.theme, "dark");
  assert.equal(out.instances[0].port, 25565);
});

test("日志里的 GitHub 令牌与 Bearer 被抹掉", () => {
  const text = redactText("token ghp_abcdefghij1234567890 and Bearer abcdef1234567890");
  assert.ok(!text.includes("ghp_abcdefghij"));
  assert.ok(!text.includes("abcdef1234567890"));
  assert.ok(text.includes("REDACTED"));
});

test("现场包包含说明、上下文、知识库与日志", () => {
  const out = path.join(os.tmpdir(), `aidiag-${Date.now()}.zip`);
  const res = exportBundle({
    outFile: out,
    appVersion: "27.0.0",
    instance: { name: "测试服", mcVersion: "26.1", loader: "fabric", dir: "D:/srv", port: 25565 },
    logs: ["[06:11:22] [ERROR] boom", "ghp_abcdefghij1234567890"],
    symptom: { title: "起不来", detail: "秒退" },
    config: { token: "supersecret" },
    docsDir: path.join(__dirname, "..", "..", "docs", "ai"),
  });
  assert.equal(res.ok, true);
  const entries = execFileSync("tar", ["-tf", out], { encoding: "utf8" });
  for (const name of ["README.md", "context.md", "knowledge.md", "logs/recent.log", "config.sanitized.json"]) {
    assert.ok(entries.includes(name), `缺少 ${name}`);
  }
  const log = execFileSync("tar", ["-xOf", out, "logs/recent.log"], { encoding: "utf8" });
  assert.ok(!log.includes("ghp_abcdefghij"));
  const cfg = execFileSync("tar", ["-xOf", out, "config.sanitized.json"], { encoding: "utf8" });
  assert.ok(!cfg.includes("supersecret"));
  fs.rmSync(out, { force: true });
});
