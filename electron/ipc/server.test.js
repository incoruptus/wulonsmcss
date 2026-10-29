/**
 * 启动方式的判据
 * ------------------------------------------------------------
 * Forge 1.17+ / NeoForge **不能** `java -jar`：
 * 真实参数在 libraries/net/.../<ver>/win_args.txt，内存写进 user_jvm_args.txt。
 * 这条测试钉住"怎么判断该走哪条路"，因为走错就是"服务器根本起不来"。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findArgsFile } = require("./server.js");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcss-srv-"));
}

test("NeoForge 目录：能找到 win_args.txt", () => {
  const dir = tmp();
  const target = path.join(dir, "libraries", "net", "neoforged", "neoforge", "26.1.0", "win_args.txt");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "--launchTarget forge_server");
  assert.strictEqual(findArgsFile(dir), target);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Forge 目录：同样找到", () => {
  const dir = tmp();
  const target = path.join(dir, "libraries", "net", "minecraftforge", "forge", "26.1.2-64.1.5", "win_args.txt");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "x");
  assert.strictEqual(findArgsFile(dir), target);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Paper / Fabric / 空目录：不给 argsfile，维持 -jar 逻辑", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "server.jar"), "");
  assert.strictEqual(findArgsFile(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(findArgsFile(path.join(os.tmpdir(), "mcss-nope-xxx")), null);
});
