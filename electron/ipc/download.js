/**
 * 下载器（断点续传 + 多源回退 + 哈希校验 + 缓存复用）
 * ------------------------------------------------------------
 * 服务器 jar 动辄几十 MB、frpc 十几 MB，一次断网就白下——
 * 所以这里做四件事：
 *   1. 目标已存在且哈希对得上 → 直接用（缓存）
 *   2. 有 .part 就用 Range 续传（服务端不支持就重下）
 *   3. 一个源失败/校验不过 → 换下一个源
 *   4. 下完校验 sha1/sha512，对不上就丢掉重来
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** 计算文件哈希（流式，避免把大文件读进内存） */
function hashFile(file, algorithm = "sha1") {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function matches(file, expected) {
  if (!expected) return false;
  for (const [algorithm, value] of Object.entries(expected)) {
    if (!value) continue;
    try {
      const actual = await hashFile(file, algorithm);
      if (actual.toLowerCase() !== String(value).toLowerCase()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/**
 * 从单个源下载到 dest（支持从 .part 续传）。
 *
 * 刻意不用 fetch：它走全局连接池，keep-alive 的套接字会一直挂着（连测试进程都不退出），
 * 而下载器要的是「一次一个连接、用完就关」这种可控行为。
 * @returns {Promise<{bytes:number, resumed:boolean}>}
 */
function fetchOnce(url, dest, { onProgress, stallMs = 20000, timeoutMs = 10 * 60 * 1000, redirects = 0 } = {}) {
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const already = sizeOf(part);
  const headers = { "user-agent": "WulonsMCSS/27" };
  if (already > 0) headers.range = `bytes=${already}-`;

  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? require("https") : require("http");
    let settled = false;
    let lastActivity = Date.now();
    let timer = null;
    let watchdog = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (watchdog) clearInterval(watchdog);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const req = lib.get(url, { headers, agent: false }, (res) => {
      lastActivity = Date.now();
      const resumable = res.statusCode === 206;
      // GitHub Release / CDN 会 302；以前这里直接失败，桌面版下不了 frpc
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        const location = res.headers.location;
        res.resume();
        if (!location || redirects >= 5) {
          finish(reject, new Error(`HTTP ${res.statusCode}：重定向次数过多或缺少 Location 响应头`));
          return;
        }
        // 不要先 resolve，交给下一跳；只做清理并标记已交接
        settled = true;
        cleanup();
        fetchOnce(new URL(location, url).toString(), dest, {
          onProgress,
          stallMs,
          timeoutMs,
          redirects: redirects + 1,
        }).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200 && !resumable) {
        res.resume();
        finish(reject, new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const total = Number(res.headers["content-length"] || 0) + (resumable ? already : 0);
      // 注意：createWriteStream 只认 "w"/"a"
      const out = fs.createWriteStream(part, { flags: resumable ? "a" : "w" });
      let received = resumable ? already : 0;

      out.once("error", (e) => {
        req.destroy();
        finish(reject, e);
      });

      res.on("data", (chunk) => {
        lastActivity = Date.now();
        received += chunk.length;
        if (!out.write(chunk)) {
          res.pause();
          out.once("drain", () => res.resume());
        }
        onProgress?.(received, total || 0);
      });
      res.on("end", () => {
        out.end(() => {
          // 有 Content-Length 就必须对得上；否则截断的文件会被当成成功
          if (total > 0 && received !== total) {
            finish(reject, new Error(`下载不完整（${received}/${total} 字节）`));
            return;
          }
          finish(resolve, { bytes: received, resumed: resumable });
        });
      });
      res.on("error", (e) => {
        out.destroy();
        finish(reject, e);
      });
    });

    req.on("error", (e) => finish(reject, e));
    req.setTimeout(stallMs, () => {
      req.destroy();
      finish(reject, new Error("连接长时间无数据，已中断"));
    });
    timer = setTimeout(() => {
      req.destroy();
      finish(reject, new Error("连接超时"));
    }, timeoutMs);
    watchdog = setInterval(() => {
      if (Date.now() - lastActivity > stallMs) {
        req.destroy();
        finish(reject, new Error("连接长时间无数据，已中断"));
      }
    }, 1000);
  });
}

/**
 * 下载一个文件，带多源回退与哈希校验。
 *
 * @param {object} options
 * @param {string} options.url          首选地址
 * @param {string[]} [options.mirrors]  镜像前缀（"" 表示直连），会按顺序尝试
 * @param {string} options.dest         目标路径
 * @param {{sha1?:string, sha512?:string}} [options.hash] 期望哈希
 * @param {(got:number,total:number)=>void} [options.onProgress]
 * @param {(url:string,error:string)=>void} [options.onRetry]
 * @returns {Promise<{ok:boolean, path:string, bytes:number, cached?:boolean, source?:string}>}
 */
async function download({ url, mirrors, dest, hash, onProgress, onRetry, stallMs, timeoutMs }) {
  // 1) 缓存：**只有带哈希且对得上**才算命中。
  //    没有哈希时绝不能跳过下载——否则换核心会“成功”但文件还是旧的。
  if (fs.existsSync(dest)) {
    if (hash && (await matches(dest, hash))) {
      return { ok: true, path: dest, bytes: sizeOf(dest), cached: true };
    }
    // 无 hash 时保留旧文件：新文件先写 .part，成功后才覆盖；失败不能把旧核心删了
    if (hash) {
      try {
        fs.unlinkSync(dest);
      } catch {}
    }
  }

  const candidates = (mirrors?.length ? mirrors : [""]).map((prefix) => (prefix ? `${prefix}${url}` : url));
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const result = await fetchOnce(candidate, dest, { onProgress, stallMs, timeoutMs });
      const part = `${dest}.part`;

      if (hash && !(await matches(part, hash))) {
        // 校验不过：删掉半成品，换下一个源
        try {
          fs.unlinkSync(part);
        } catch {}
        throw new Error("文件校验未通过，可能下载中断或源文件已被篡改");
      }

      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(part, dest);
      return { ok: true, path: dest, bytes: result.bytes, source: candidate };
    } catch (e) {
      lastError = e;
      onRetry?.(candidate, e.message);
    }
  }

  throw lastError ?? new Error("下载失败");
}

module.exports = { download, fetchOnce, hashFile, matches };
