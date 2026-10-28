const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { ping, varint, minecraftText } = require("./slp.js");

const PORT = 28512;

function startMock() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "..", "scripts", "mock-slp.cjs"), String(PORT)], {
    stdio: "ignore",
  });
  return new Promise((resolve) => setTimeout(() => resolve(child), 600));
}

test("varint 编码（0/127/128/25565）", () => {
  assert.deepEqual([...varint(0)], [0x00]);
  assert.deepEqual([...varint(127)], [0x7f]);
  assert.deepEqual([...varint(128)], [0x80, 0x01]);
  assert.deepEqual([...varint(25565)], [0xdd, 0xc7, 0x01]);
});

test("MOTD 的 text/extra 结构拼成纯文本", () => {
  assert.equal(minecraftText("hi"), "hi");
  assert.equal(minecraftText({ text: "A", extra: [{ text: "B" }, "C"] }), "ABC");
  assert.equal(minecraftText(null), "");
});

test("对着 mock 服务端能问到在线人数与 MOTD", async () => {
  const mock = await startMock();
  try {
    const res = await ping("127.0.0.1", PORT, 1500);
    assert.equal(res.ok, true);
    assert.deepEqual(res.players, { online: 3, max: 10 });
    assert.equal(res.version, "26.1");
    assert.equal(res.motd, "朋友的生存服 · 晚上八点开");
  } finally {
    mock.kill();
  }
});

test("端口没人监听时返回 ok=false 而不是抛错", async () => {
  const res = await ping("127.0.0.1", 1, 500);
  assert.equal(res.ok, false);
  assert.equal(res.online, false);
  assert.ok(res.error);
});
