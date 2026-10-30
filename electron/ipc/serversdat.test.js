/**
 * servers.dat：只追加/更新，读不懂时绝不能清空玩家列表
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { addServer, parse, serialize } = require("./serversdat.js");

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "mcss-servers-"));

test("追加两条并保留；同 ip 只更新名字", () => {
  const dir = tmpDir();
  addServer(dir, { name: "A", ip: "a.example:25565" });
  addServer(dir, { name: "B", ip: "b.example:25565" });
  const file = path.join(dir, "servers.dat");
  let list = parse(fs.readFileSync(file));
  assert.equal(list.length, 2);

  addServer(dir, { name: "A2", ip: "a.example:25565" });
  list = parse(fs.readFileSync(file));
  assert.equal(list.length, 2);
  assert.equal(list.find((s) => s.ip === "a.example:25565").name, "A2");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("serialize → parse 往返", () => {
  const list = [
    { name: "中文服", ip: "1.2.3.4:25565" },
    { name: "B", ip: "b:1" },
  ];
  assert.deepEqual(parse(serialize(list)), list);
});

test("读不懂的 servers.dat 不做覆盖，先留 .bak", () => {
  const dir = tmpDir();
  const file = path.join(dir, "servers.dat");
  const original = Buffer.from([0x0b, 0x00, 0x00, 0x01]); // 不是 compound
  fs.writeFileSync(file, original);
  assert.throws(() => addServer(dir, { name: "NEW", ip: "new:25565" }), /无法识别/);
  assert.deepEqual(fs.readFileSync(file), original, "原文件不能被改");
  assert.ok(fs.existsSync(`${file}.bak`), "应留下备份");
  fs.rmSync(dir, { recursive: true, force: true });
});
