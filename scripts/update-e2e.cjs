/**
 * 轻量更新链路端到端检查（不含替换重启）。
 *
 * 起一个本地静态服务，按客户端的方式走一遍：
 *   读 update.json → 下载 asar.gz → 校验 sha256 / size → 解压 → 读 asar 目录
 *
 * 替换重启那一步只能在打包后验证（开发模式下 resourcesPath 指向 Electron 自己），
 * 所以这里把能验的都验了：清单地址解析、包完整性、以及 asar 里确实有应用代码。
 *
 *   node scripts/update-e2e.cjs
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const DIR = path.join(__dirname, "..", "release", "update");
const PORT = Number(process.env.UPDATE_PORT || 8099);

function fail(message) {
  console.error(`update e2e FAILED: ${message}`);
  process.exitCode = 1;
}

function serve() {
  const server = http.createServer((req, res) => {
    const raw = decodeURIComponent(String(req.url || "/").split("?")[0]);
    const name = raw.replace(/^\/+/, "") || "update.json";
    const file = path.join(DIR, name);
    if (!file.startsWith(DIR) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": name.endsWith(".json") ? "application/json" : "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

async function main() {
  if (!fs.existsSync(path.join(DIR, "update.json"))) {
    fail("缺少 release/update/update.json，先运行 node scripts/make-update.cjs");
    return;
  }

  const server = await serve();
  try {
    const base = `http://127.0.0.1:${PORT}/update.json`;
    const first = await fetch(base);
    const text = await first.text();
    if (!text.trimStart().startsWith("{")) {
      throw new Error(
        `清单返回的不是 JSON（HTTP ${first.status}，content-type ${first.headers.get("content-type")}，开头 ${JSON.stringify(text.slice(0, 40))}）`,
      );
    }
    const manifest = JSON.parse(text);
    if (!manifest.version || !manifest.asar) throw new Error("清单字段不完整");

    const url = new URL(manifest.asar.url, new URL(base)).toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    if (buf.length !== manifest.asar.size) {
      throw new Error(`size 不匹配：清单 ${manifest.asar.size}，实际 ${buf.length}`);
    }
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (sha !== manifest.asar.sha256) throw new Error("sha256 不匹配");

    const asar = zlib.gunzipSync(buf);
    if (asar.length !== manifest.asar.packed) throw new Error("解压后大小与清单不符");

    // asar 的头部是两层 pickle：外层 4 字节大小、内层 pickle 大小、
    // 字符串 pickled 的大小、字符串长度，之后才是 JSON（偏移 16）。
    const jsonSize = asar.readUInt32LE(12);
    const header = JSON.parse(asar.subarray(16, 16 + jsonSize).toString());
    if (!header.files || !header.files["package.json"] || !header.files.out) {
      throw new Error("asar 结构不对，缺 package.json 或 out/");
    }

    const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;
    console.log("update e2e OK");
    console.log(`  version ${manifest.version}  runtime ${manifest.runtime}`);
    console.log(`  download ${mb(buf.length)}  unpacked ${mb(asar.length)}`);
    console.log(`  sha256 ${sha.slice(0, 16)}…`);
  } catch (e) {
    fail(e.message);
  } finally {
    server.close();
  }
}

main();
