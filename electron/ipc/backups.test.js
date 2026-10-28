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
