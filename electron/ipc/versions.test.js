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
