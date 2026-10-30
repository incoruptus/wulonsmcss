/**
 * 玩家客户端准备：已有文件的覆盖判断
 * ------------------------------------------------------------
 * 以前的规则是"存在且大小相同就跳过"。大小是弱证据：
 * 不同构建、被人手工换过的 jar 常常大小一样，
 * 跳过它 = 玩家进服时 Mod 不匹配，而且报错完全看不出原因。
 * 现在有哈希就按哈希判，没有哈希才退回大小。
 */
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { needsReplace, safeFileName, scanClient } = require("./client.js");

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-prep-"));
  const file = path.join(dir, "mod.jar");
  fs.writeFileSync(file, content);
  return { dir, file };
}

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

test("目标不存在 → 不需要覆盖（直接下）", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-prep-"));
  assert.equal(await needsReplace(path.join(dir, "nope.jar"), { size: 3 }), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("哈希一致 → 不需要覆盖（真机跑过：sodium 重复准备是 skipped）", async () => {
  const content = Buffer.from("same-content");
  const { dir, file } = tmpFile(content);
  assert.equal(await needsReplace(file, { size: content.length, sha1: sha1(content) }), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("同大小但内容不同 → 必须覆盖（这就是旧逻辑漏掉的情况）", async () => {
  const original = Buffer.from("AAAAAAAA");
  const { dir, file } = tmpFile(Buffer.from("BBBBBBBB")); // 长度一样
  assert.equal(await needsReplace(file, { size: original.length, sha1: sha1(original) }), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("没有哈希时退回大小比较", async () => {
  const { dir, file } = tmpFile(Buffer.from("12345"));
  assert.equal(await needsReplace(file, { size: 5 }), false, "大小相同就当同一份");
  assert.equal(await needsReplace(file, { size: 6 }), true, "大小不同要覆盖");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("扫描客户端：Fabric / Forge / 原版都能认出 MC 版本与加载器", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-scan-"));
  const versions = path.join(dir, "versions");
  const add = (folder, json) => {
    fs.mkdirSync(path.join(versions, folder), { recursive: true });
    fs.writeFileSync(path.join(versions, folder, `${folder}.json`), JSON.stringify(json));
  };
  add("fabric-loader-0.16.9-1.21.1", {
    id: "fabric-loader-0.16.9-1.21.1",
    inheritsFrom: "1.21.1",
    libraries: [{ name: "net.fabricmc:fabric-loader:0.16.9" }],
  });
  add("1.20.1-forge-47.2.0", {
    id: "1.20.1-forge-47.2.0",
    inheritsFrom: "1.20.1",
    libraries: [{ name: "net.minecraftforge:forge:1.20.1-47.2.0" }],
  });
  add("1.21.1", { id: "1.21.1" });
  fs.writeFileSync(
    path.join(dir, "launcher_profiles.json"),
    JSON.stringify({
      profiles: {
        fabric: { name: "Fabric 生存", lastVersionId: "fabric-loader-0.16.9-1.21.1", lastUsed: 200 },
        forge: { name: "Forge 旧包", lastVersionId: "1.20.1-forge-47.2.0", lastUsed: 100 },
      },
    }),
  );

  const scan = scanClient(dir);
  const fabric = scan.versions.find((v) => v.id === "fabric-loader-0.16.9-1.21.1");
  const forge = scan.versions.find((v) => v.id === "1.20.1-forge-47.2.0");
  const vanilla = scan.versions.find((v) => v.id === "1.21.1");
  assert.equal(fabric.loader, "fabric");
  assert.equal(fabric.mcVersion, "1.21.1");
  assert.equal(fabric.loaderVersion, "0.16.9");
  assert.equal(forge.loader, "forge");
  assert.equal(forge.loaderVersion, "47.2.0");
  assert.equal(vanilla.loader, "vanilla");
  assert.equal(scan.recommended.id, "fabric-loader-0.16.9-1.21.1");
  assert.equal(scan.recommended.name, "Fabric 生存");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("远端文件名不能带路径（防写到 mods/ 之外）", () => {
  assert.equal(safeFileName("sodium.jar"), "sodium.jar");
  assert.equal(safeFileName("..\\..\\Startup\\evil.jar"), "evil.jar");
  assert.equal(safeFileName("C:\\temp\\a.jar"), "a.jar");
  assert.equal(safeFileName(".."), "mod.jar");
  assert.equal(safeFileName("a:b?.jar"), "b_.jar");
  assert.equal(safeFileName(""), "mod.jar");
});
