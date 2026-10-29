/**
 * 预检：服务端 jar 的判据
 * ------------------------------------------------------------
 * 回归事故：加了 Forge/NeoForge 自动安装之后，预检还在找 server.jar，
 * 于是 Forge 实例永远报「找不到服务端 jar」——而预检报 error 时
 * UI 会把「启动」按钮禁掉。等于新功能装好了却起不来。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkJar, hasArgsFile } = require("./preflight.js");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcss-pf-"));
}

test("空目录 → 报 jar-missing", () => {
  const dir = tmp();
  const issue = checkJar(dir);
  assert.equal(issue?.id, "jar-missing");
  assert.equal(issue?.level, "error");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fabric / 原版：有 jar 就通过", () => {
  for (const name of ["fabric-server-launch.jar", "server.jar"]) {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, name), "");
    assert.equal(checkJar(dir), null, `${name} 应通过`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Forge：只有 win_args.txt 也必须通过（回归）", () => {
  const dir = tmp();
  const args = path.join(dir, "libraries", "net", "minecraftforge", "forge", "26.1.2-64.1.5", "win_args.txt");
  fs.mkdirSync(path.dirname(args), { recursive: true });
  fs.writeFileSync(args, "--launchTarget forge_server");
  assert.equal(hasArgsFile(dir), true);
  assert.equal(checkJar(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("NeoForge：同样通过", () => {
  const dir = tmp();
  const args = path.join(dir, "libraries", "net", "neoforged", "neoforge", "26.1.0", "win_args.txt");
  fs.mkdirSync(path.dirname(args), { recursive: true });
  fs.writeFileSync(args, "x");
  assert.equal(checkJar(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("只有 win_args.txt 但内容为空也算有（判据是文件存在）", () => {
  const dir = tmp();
  const args = path.join(dir, "libraries", "net", "neoforged", "neoforge", "1", "win_args.txt");
  fs.mkdirSync(path.dirname(args), { recursive: true });
  fs.writeFileSync(args, "");
  assert.equal(checkJar(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
