/**
 * versions 通道契约
 * ------------------------------------------------------------
 * 黑屏事故复盘：`versions:fabric-loaders` 之前直接返回 [{version, stable}]，
 * 渲染层按 api.ts 的 `Promise<string[]>` 当字符串用，对象进了 <option>，
 * React 抛 #31 并卸载整棵树 —— 用户看到的是一面纯黑窗口。
 *
 * 这条测试把「通道给渲染层的形状」钉死在这里：只要有人再往这个通道塞对象，
 * CI 立刻红，而不是等用户点开「新建实例」才发现。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const versions = require("./versions.js");

const FABRIC_PAYLOAD = [
  { loader: { version: "0.16.8", stable: false }, intermediary: {}, launcherMeta: {} },
  { loader: { version: "0.16.9", stable: true }, intermediary: {}, launcherMeta: {} },
  { loader: { version: "0.17.0-beta.1", stable: false }, intermediary: {}, launcherMeta: {} },
  { loader: {}, intermediary: {} },
  { loader: { version: "" } },
];

function stubFetch(payload) {
  const original = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/versions/loader/")) {
      return { ok: true, json: async () => payload, headers: new Map() };
    }
    return { ok: true, json: async () => [], headers: new Map() };
  };
  return () => {
    global.fetch = original;
  };
}

test("versions:fabric-loaders 返回字符串数组（渲染层契约）", async () => {
  const restore = stubFetch(FABRIC_PAYLOAD);
  try {
    const list = await versions.fabricLoaders("26.1");
    assert.ok(Array.isArray(list), "必须是数组");
    for (const v of list) {
      assert.strictEqual(typeof v, "string", `列表元素必须是字符串，实际是 ${typeof v}: ${JSON.stringify(v)}`);
    }
  } finally {
    restore();
  }
});

test("稳定版排在前面，空版本被丢掉", async () => {
  const restore = stubFetch(FABRIC_PAYLOAD);
  try {
    const list = await versions.fabricLoaders("26.1");
    assert.deepStrictEqual(list, ["0.16.9", "0.16.8", "0.17.0-beta.1"]);
  } finally {
    restore();
  }
});

test("fabricLoaderList 保留 stable 标记（内部用）", async () => {
  const restore = stubFetch(FABRIC_PAYLOAD);
  try {
    const list = await versions.fabricLoaderList("26.1");
    assert.deepStrictEqual(list[0], { version: "0.16.9", stable: true });
    assert.strictEqual(list.length, 3);
  } finally {
    restore();
  }
});

test("Fabric 接口挂了要抛错，而不是返回 undefined 让 UI 崩", async () => {
  const restore = stubFetch(null);
  try {
    global.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
    await assert.rejects(() => versions.fabricLoaders("26.1"), /HTTP 502/);
  } finally {
    restore();
  }
});

/* ------------------------- 插件服（Paper / Purpur） ------------------------- */

test("Paper 构建列表是字符串数组，且跳过没有服务端 jar 的构建", async () => {
  const restore = stubFetch(null);
  global.fetch = async (url) => {
    if (String(url).includes("/projects/paper/versions/")) {
      return {
        ok: true,
        json: async () => [
          { id: 74, downloads: { "server:default": { url: "https://x/paper.jar" } } },
          { id: 73, downloads: {} },
          { id: 72, downloads: { "server:default": { url: "https://x/paper.jar" } } },
        ],
      };
    }
    return { ok: true, json: async () => ({}) };
  };
  try {
    const builds = await versions.paperBuilds("26.1.2");
    assert.deepStrictEqual(builds, ["74", "72"]);
    for (const b of builds) assert.strictEqual(typeof b, "string");
  } finally {
    restore();
  }
});

test("Purpur 构建列表倒序（最新在前）", async () => {
  const restore = stubFetch(null);
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ builds: { all: [10, 11, 12] } }),
  });
  try {
    assert.deepStrictEqual(await versions.purpurBuilds("26.1.2"), ["12", "11", "10"]);
  } finally {
    restore();
  }
});

/* ------------------------------- 核心探测 ------------------------------- */

test("探测：自家标记最高优先", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-detect-"));
  fs.writeFileSync(path.join(dir, ".mcss-server.json"), JSON.stringify({ serverType: "purpur", mc: "26.1.2", build: "2592" }));
  fs.mkdirSync(path.join(dir, "plugins"));
  const res = versions.detectServer(dir);
  assert.strictEqual(res.serverType, "purpur");
  assert.strictEqual(res.confidence, "high");
  assert.strictEqual(res.mc, "26.1.2");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("探测：没有标记时按目录特征判断", () => {
  const cases = [
    { files: ["libraries/net/neoforged"], want: "neoforge" },
    { files: ["libraries/net/minecraftforge"], want: "forge" },
    { files: ["purpur.yml"], want: "purpur" },
    { files: ["config/paper-global.yml"], want: "paper" },
    { files: ["fabric-server-launch.jar"], want: "fabric" },
    { files: ["plugins"], want: "paper" },
    { files: ["mods"], want: "fabric" },
    { files: ["server.jar"], want: "vanilla" },
  ];
  for (const c of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-detect-"));
    for (const f of c.files) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      if (f.includes(".")) fs.writeFileSync(path.join(dir, f), "");
      else fs.mkdirSync(path.join(dir, f), { recursive: true });
    }
    const res = versions.detectServer(dir);
    assert.strictEqual(res && res.serverType, c.want, `${c.files.join(",")} 应该判成 ${c.want}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("探测：空目录返回 null，不抛错", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-detect-"));
  assert.strictEqual(versions.detectServer(dir), null);
  assert.strictEqual(versions.detectServer(""), null);
  assert.strictEqual(versions.detectServer(path.join(dir, "nope")), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Forge/NeoForge 安装前必须知道 Java：没给就明确拒绝，且不落任何文件", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-install-"));
  for (const t of ["forge", "neoforge"]) {
    await assert.rejects(
      () => versions.installServer({ dir, mc: "26.1.2", serverType: t }),
      /需要先指定 Java/,
      `${t} 应该明确要求 Java`,
    );
  }
  assert.deepStrictEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Forge 版本解析：走 promotions_slim（有网时）", async (t) => {
  let got = null;
  try {
    got = await versions.forgeBuilds("26.1.2");
  } catch (e) {
    t.skip("无网络，跳过");
    return;
  }
  assert.ok(Array.isArray(got));
  for (const v of got) assert.strictEqual(typeof v, "string");
});
