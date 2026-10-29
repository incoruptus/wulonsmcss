/**
 * 文件通道的删除守卫
 * ------------------------------------------------------------
 * `fs:remove` 是递归删除。UI 调用点都做了名字白名单，但通道本身可以被直接调用
 * （网页版 agent 也能被调用），所以通道层必须再挡一道——
 * 一个空串或 "D:\" 进来就是灾难。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { remove } = require("./files.js");

test("拒绝空路径", () => {
  for (const bad of ["", "   ", null, undefined]) {
    assert.throws(() => remove(bad), /拒绝删除/, `${JSON.stringify(bad)} 应被拒绝`);
  }
});

test("拒绝盘符根目录", () => {
  for (const bad of ["C:\\", "D:\\", "D:/", "C:"]) {
    assert.throws(() => remove(bad), /拒绝删除/, `${bad} 应被拒绝`);
  }
});

test("正常目录能删，且真的删掉了", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-rm-"));
  const target = path.join(dir, "world");
  fs.mkdirSync(path.join(target, "region"), { recursive: true });
  fs.writeFileSync(path.join(target, "region", "r.0.0.mca"), "x");

  remove(target);
  assert.equal(fs.existsSync(target), false);
  assert.ok(fs.existsSync(dir), "只删目标，不连带父目录");
  fs.rmSync(dir, { recursive: true, force: true });
});
