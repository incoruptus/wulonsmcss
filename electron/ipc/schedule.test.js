const { test } = require("node:test");
const assert = require("node:assert");
const { tick } = require("./schedule.js");

const at = (h, m, day = 1) => new Date(2026, 10, day, h, m, 0);

test("没在运行就不动作", () => {
  const r = tick({ schedule: { restartAt: "04:00", backupEvery: 1 }, running: false, now: at(4, 0) });
  assert.deepEqual(r.actions, []);
});

test("每日重启当天只触发一次", () => {
  const schedule = { restartAt: "04:00" };
  const first = tick({ schedule, running: true, now: at(4, 0) });
  assert.equal(first.actions[0].type, "restart");

  const again = tick({ schedule, state: first.state, running: true, now: at(4, 0) });
  assert.deepEqual(again.actions, []);

  const nextDay = tick({ schedule, state: first.state, running: true, now: at(4, 0, 2) });
  assert.equal(nextDay.actions[0].type, "restart");
});

test("定时公告按间隔触发", () => {
  const schedule = { broadcastEvery: 30, broadcastText: "欢迎" };
  const t0 = at(12, 0);
  const first = tick({ schedule, running: true, now: t0 });
  assert.deepEqual(first.actions, [], "首次不计时，不立刻发");
  assert.equal(first.state.broadcastAt, t0.getTime());

  const half = tick({ schedule, state: first.state, running: true, now: at(12, 20) });
  assert.deepEqual(half.actions, []);

  const due = tick({ schedule, state: first.state, running: true, now: at(12, 30) });
  assert.equal(due.actions[0].type, "broadcast");
  assert.equal(due.actions[0].text, "欢迎");
});

test("定时备份按间隔触发", () => {
  const schedule = { backupEvery: 60 };
  const t0 = at(8, 0);
  const first = tick({ schedule, running: true, now: t0 });
  assert.deepEqual(first.actions, []);
  const later = tick({ schedule, state: first.state, running: true, now: at(9, 0) });
  assert.equal(later.actions[0].type, "backup");
});

test("多个任务同一拍可以同时触发", () => {
  const schedule = { restartAt: "04:00", backupEvery: 1, backupText: "x" };
  const t0 = at(3, 59);
  const warm = tick({ schedule, running: true, now: t0 });
  const r = tick({ schedule, state: warm.state, running: true, now: at(4, 0) });
  const types = r.actions.map((a) => a.type).sort();
  assert.deepEqual(types, ["backup", "restart"]);
});

test("没有计划时返回空", () => {
  assert.deepEqual(tick({ schedule: null, running: true, now: at(4, 0) }).actions, []);
});
