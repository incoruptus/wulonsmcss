/**
 * 定时任务的判定逻辑（纯函数，方便测试）
 * ------------------------------------------------------------
 * 主进程每 30 秒调一次 tick，拿到「这一拍该做什么」，再执行。
 * 状态只记在内存（重启应用后重新计时），避免把运行态写进配置。
 */

/**
 * @typedef {object} Schedule
 * @property {string} [restartAt]       "04:30"
 * @property {number} [broadcastEvery]  分钟
 * @property {string} [broadcastText]
 * @property {number} [backupEvery]     分钟
 */

/**
 * @param {object} input
 * @param {Schedule|null} input.schedule
 * @param {object} input.state           上一次的状态
 * @param {boolean} input.running        服务器是否在跑
 * @param {Date} input.now
 * @returns {{ actions: Array<{type:string, text?:string}>, state: object }}
 */
function tick({ schedule, state = {}, running, now = new Date() }) {
  if (!schedule || !running) return { actions: [], state };

  const next = { ...state };
  const actions = [];
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // 每日重启：同一天只触发一次
  if (schedule.restartAt && schedule.restartAt === hhmm && next.restartDay !== today) {
    next.restartDay = today;
    actions.push({ type: "restart" });
  }

  // 定时公告：首次不立刻发，等满一个间隔
  const every = Number(schedule.broadcastEvery) || 0;
  if (every > 0 && schedule.broadcastText) {
    const last = next.broadcastAt ?? now.getTime();
    if (now.getTime() - last >= every * 60_000) {
      next.broadcastAt = now.getTime();
      actions.push({ type: "broadcast", text: schedule.broadcastText });
    } else if (next.broadcastAt === undefined) {
      next.broadcastAt = last;
    }
  }

  // 定时备份：同样从「现在」开始计时
  const backupEvery = Number(schedule.backupEvery) || 0;
  if (backupEvery > 0) {
    const last = next.backupAt ?? now.getTime();
    if (now.getTime() - last >= backupEvery * 60_000) {
      next.backupAt = now.getTime();
      actions.push({ type: "backup" });
    } else if (next.backupAt === undefined) {
      next.backupAt = last;
    }
  }

  return { actions, state: next };
}

module.exports = { tick };
