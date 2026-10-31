const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSnapshot, listSnapshots, restoreSnapshot, objectsSize, objectsDir } = require("./backups.js");

function makeWorld(dir) {
  fs.mkdirSync(path.join(dir, "world", "region"), { recursive: true });
  fs.mkdirSync(path.join(dir, "world", "playerdata"), { recursive: true });
  fs.writeFileSync(path.join(dir, "world", "level.dat"), "LEVEL");
  fs.writeFileSync(path.join(dir, "world", "region", "r.0.0.mca"), Buffer.alloc(4096, 1));
  fs.writeFileSync(path.join(dir, "world", "playerdata", "steve.dat"), "STEVE");
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcss-snap-"));
}

test("第一次快照把所有文件存进 objects", async () => {
  const dir = tmp();
  makeWorld(dir);
  const res = await createSnapshot(dir);
  assert.equal(res.ok, true);
  assert.equal(res.files, 3);
  assert.equal(res.bytesNew, res.bytesTotal, "首次所有字节都是新的");
  assert.equal(fs.readdirSync(objectsDir(dir)).length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("内容没变的文件不重复占空间", async () => {
  const dir = tmp();
  makeWorld(dir);
  await createSnapshot(dir);

  // 只改一个 region 文件
  fs.writeFileSync(path.join(dir, "world", "region", "r.0.0.mca"), Buffer.alloc(4096, 2));
  const second = await createSnapshot(dir);

  assert.equal(second.ok, true);
  assert.equal(second.bytesNew, 4096, "只有变化的那一个文件是新的");
  assert.equal(fs.readdirSync(objectsDir(dir)).length, 4, "对象数 = 3 + 1 个新版本");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("列表按时间倒序，并给出已用总大小", async () => {
  const dir = tmp();
  makeWorld(dir);
  await createSnapshot(dir);
  await new Promise((r) => setTimeout(r, 1100));
  await createSnapshot(dir);

  const list = listSnapshots(dir);
  assert.equal(list.length, 2);
  assert.ok(list[0].at >= list[1].at);
  assert.equal(list[0].files, 3);
  assert.equal(list[0].stored, objectsSize(dir));
  assert.ok(list[0].bytesTotal >= list[0].stored, "总字节 ≥ 实际占用（说明去重生效）");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("恢复能把内容还原，并把旧存档留底", async () => {
  const dir = tmp();
  makeWorld(dir);
  const snap = await createSnapshot(dir);

  fs.writeFileSync(path.join(dir, "world", "level.dat"), "CORRUPTED");
  fs.rmSync(path.join(dir, "world", "playerdata"), { recursive: true, force: true });

  const res = restoreSnapshot(dir, snap.name);
  assert.equal(res.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, "world", "level.dat"), "utf8"), "LEVEL");
  assert.equal(fs.readFileSync(path.join(dir, "world", "playerdata", "steve.dat"), "utf8"), "STEVE");
  assert.ok(fs.existsSync(path.join(dir, res.parked)), "旧存档应留底");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("快照不存在时恢复失败但不破坏现场", () => {
  const dir = tmp();
  makeWorld(dir);
  const res = restoreSnapshot(dir, "snap-nope");
  assert.equal(res.ok, false);
  assert.ok(fs.existsSync(path.join(dir, "world", "level.dat")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("没有 world 目录时不打空快照", async () => {
  const dir = tmp();
  const res = await createSnapshot(dir);
  assert.equal(res.ok, false);
  assert.match(res.error, /world/);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* --------------------------- 对抗性：manifest 是数据 --------------------------- */

/** 手写一份带穿越路径的 manifest（模拟快照被拷贝/同步/手改过） */
function writeEvilManifest(dir, name, relPath) {
  const payload = Buffer.from("pwned");
  const hash = require("crypto").createHash("sha1").update(payload).digest("hex");
  fs.mkdirSync(objectsDir(dir), { recursive: true });
  fs.writeFileSync(path.join(objectsDir(dir), hash), payload);
  fs.mkdirSync(path.join(dir, "backups", "snapshots", name), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "backups", "snapshots", name, "manifest.json"),
    JSON.stringify({ version: 1, at: Date.now(), files: 1, bytesTotal: 5, bytesNew: 5, entries: [{ path: relPath, size: 5, hash }] }),
  );
}

test("恢复会拒绝穿越路径的 manifest，且一个字节都不写出去", () => {
  const dir = tmp();
  makeWorld(dir);
  writeEvilManifest(dir, "snap-evil", "../escaped.txt");

  const res = restoreSnapshot(dir, "snap-evil");
  assert.equal(res.ok, false);
  assert.match(res.error, /不合法/);
  // 关键：world 还在原位，存档没被移走，外面也没多出文件
  assert.equal(fs.readFileSync(path.join(dir, "world", "level.dat"), "utf8"), "LEVEL");
  assert.equal(fs.existsSync(path.join(dir, "escaped.txt")), false);
  assert.equal(fs.existsSync(path.join(path.dirname(dir), "escaped.txt")), false);
  assert.deepEqual(
    fs.readdirSync(dir).filter((n) => n.startsWith("world.before-restore")),
    [],
    "拒绝时不应该把旧存档挪走",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("恢复会拒绝绝对路径与盘符形式的 manifest", () => {
  for (const bad of ["/abs.txt", "C:\\abs.txt", "a/../../b.txt", "..", "a/..", ""]) {
    const dir = tmp();
    makeWorld(dir);
    writeEvilManifest(dir, "snap-evil", bad);
    const res = restoreSnapshot(dir, "snap-evil");
    assert.equal(res.ok, false, `${JSON.stringify(bad)} 应被拒绝`);
    assert.ok(fs.existsSync(path.join(dir, "world", "level.dat")));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("空快照与非法快照名都拒绝", () => {
  const dir = tmp();
  makeWorld(dir);
  const name = "snap-empty";
  fs.mkdirSync(path.join(dir, "backups", "snapshots", name), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "backups", "snapshots", name, "manifest.json"),
    JSON.stringify({ version: 1, at: Date.now(), files: 0, entries: [] }),
  );
  assert.equal(restoreSnapshot(dir, name).ok, false);
  for (const badName of ["..", "../x", "a/b", ""]) {
    assert.equal(restoreSnapshot(dir, badName).ok, false, `${JSON.stringify(badName)} 应被拒绝`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("整包恢复同样拒绝穿越文件名（不能指向备份目录之外的 zip）", async () => {
  const { restore } = require("./backup.js");
  const dir = tmp();
  makeWorld(dir);
  const stopped = { getStatus: () => "stopped" };
  const res = await restore(dir, "..\\..\\evil.zip", stopped);
  assert.equal(res.ok, false);
  assert.match(res.error, /不合法/);
  assert.ok(fs.existsSync(path.join(dir, "world", "level.dat")));
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ------------------------- 整包备份（异步化之后） ------------------------- */

test("整包备份 → 恢复：内容能回来，旧存档留底", async () => {
  const { create, restore, list } = require("./backup.js");
  const dir = tmp();
  makeWorld(dir);

  const made = await create(dir, null);
  assert.equal(made.ok, true, made.error);
  assert.ok(made.size > 0, "zip 不应为空");
  assert.equal(list(dir).length, 1);

  fs.writeFileSync(path.join(dir, "world", "level.dat"), "CORRUPTED");
  const back = await restore(dir, made.name, { getStatus: () => "stopped" });
  assert.equal(back.ok, true, back.error);
  assert.equal(fs.readFileSync(path.join(dir, "world", "level.dat"), "utf8"), "LEVEL");
  assert.ok(fs.existsSync(path.join(dir, back.parked)), "旧存档应留底");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("服务器在跑时不允许整包恢复（防止写坏存档）", async () => {
  const { restore } = require("./backup.js");
  const dir = tmp();
  makeWorld(dir);
  const res = await restore(dir, "whatever.zip", { getStatus: () => "running" });
  assert.equal(res.ok, false);
  assert.match(res.error, /请先停止服务器/);
  fs.rmSync(dir, { recursive: true, force: true });
});
