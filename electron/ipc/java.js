/**
 * Java 运行时探测
 * 顺序：已配置路径 → .minecraft 运行时 → 常见安装目录 → PATH
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function majorFromVersionString(text) {
  const m = String(text).match(/version "(\d+)(?:\.(\d+))?/i);
  if (!m) return null;
  const first = Number(m[1]);
  if (first === 1) return Number(m[2]) || null; // 1.8.0 → 8
  return first; // 17 / 21 / 25
}

function probeJava(javaPath) {
  // 注意：java -version 把版本号打到 stderr，必须一起收
  const res = spawnSync(javaPath, ["-version"], {
    encoding: "utf8",
    timeout: 6000,
    windowsHide: true
  });
  const text = `${res.stderr || ""}${res.stdout || ""}`;
  const major = majorFromVersionString(text);
  if (!major) return null;
  return { path: javaPath, major, version: (text.match(/version "([^"]+)"/) || [])[1] };
}

function listJavaCandidates() {
  const out = [];
  const push = (p) => {
    if (p && !out.includes(p)) out.push(p);
  };

  const appData = process.env.APPDATA || "";
  if (appData) {
    const mcRuntime = path.join(appData, ".minecraft", "runtime");
    try {
      for (const name of fs.readdirSync(mcRuntime)) {
        push(path.join(mcRuntime, name, "bin", "java.exe"));
      }
    } catch (e) {}
  }

  const roots = [
    "C:\\Program Files\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\Zulu",
    "C:\\Program Files\\BellSoft",
    "C:\\Program Files\\Amazon Corretto"
  ];
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        push(path.join(root, name, "bin", "java.exe"));
      }
    } catch (e) {}
  }

  return out.filter((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch (e) {
      return false;
    }
  });
}

function detectJava() {
  const found = [];
  for (const candidate of listJavaCandidates()) {
    const info = probeJava(candidate);
    if (info) found.push(info);
  }
  found.sort((a, b) => (b.major || 0) - (a.major || 0));
  return found;
}

function javaFor(mcMajor) {
  const all = detectJava();
  return all.find((j) => (j.major || 0) >= mcMajor) || all[0] || null;
}

module.exports = { detectJava, probeJava, majorFromVersionString };
