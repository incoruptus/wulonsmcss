/**
 * 配置壳的边界
 * ------------------------------------------------------------
 * 壳（electron/ipc/config.js 与 agent 的 Rust 实现）只做三件事：
 * 读一份 JSON、合并补丁、写回一份 JSON。
 *
 * 曾经这里强行写 `version: 27`，并且把「version !== 27」当成 v26 老结构去重建，
 * 结果一份 v28 配置会被当成"没有 instances"的空结构——差点把实例全清掉。
 * 语义迁移归渲染层（src/renderer/lib/config-model.ts），两边共用同一份逻辑。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createConfigStore, migrate, defaultConfig, SCHEMA_VERSION } = require("./config.js");

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-cfg-"));
  return path.join(dir, "config.json");
}

const V28 = {
  version: 28,
  mode: "player",
  modeAsked: true,
  instances: [{ id: "a", dir: "D:\\srv", serverType: "paper", loader: "paper" }],
  activeInstanceId: "a",
  clientProfiles: [],
  savedServers: [{ id: "s1", name: "朋友的服", address: "play.example.com" }],
};

test("v28 原样透传，不许被当成 v26 重建", () => {
  const cfg = migrate(V28);
  assert.strictEqual(cfg.version, 28);
  assert.strictEqual(cfg.instances.length, 1);
  assert.strictEqual(cfg.mode, "player");
  assert.strictEqual(cfg.savedServers.length, 1);
});

test("写回不篡改版本号", () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify(V28), "utf-8");
  const store = createConfigStore(file);
  const next = store.write({ theme: "light" });
  assert.strictEqual(next.version, 28, "壳不许把版本号改回自己的常量");
  const onDisk = JSON.parse(fs.readFileSync(file, "utf-8"));
  assert.strictEqual(onDisk.version, 28);
  assert.strictEqual(onDisk.theme, "light");
  assert.strictEqual(onDisk.instances.length, 1);
});

test("v26 扁平配置仍能升级成实例列表", () => {
  const cfg = migrate({
    version: 26,
    serverPath: "D:\\Games\\MC",
    javaPath: "java.exe",
    maxMemory: 8,
    theme: "light",
  });
  assert.strictEqual(cfg.instances.length, 1);
  assert.strictEqual(cfg.instances[0].dir, "D:\\Games\\MC");
  assert.strictEqual(cfg.instances[0].memoryMax, 8);
  assert.ok(cfg.version >= SCHEMA_VERSION || cfg.version === SCHEMA_VERSION);
});

test("空/坏文件给默认配置，且默认结构里就有新字段", () => {
  const cfg = migrate(null);
  assert.deepStrictEqual(cfg.instances, []);
  assert.strictEqual(cfg.version, defaultConfig().version);
});

test("未知键（modrinthIndex 等）不会被壳丢掉", () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ ...V28, modrinthIndex: { "a.jar": { p: "x", v: "y" } } }), "utf-8");
  const store = createConfigStore(file);
  const cfg = store.read();
  assert.deepStrictEqual(cfg.modrinthIndex, { "a.jar": { p: "x", v: "y" } });
});
