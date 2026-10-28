const fs = require("fs");
const os = require("os");
const path = require("path");
const versions = require("../electron/ipc/versions.js");

(async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dl-real-")), "server");
  const stages = [];
  const res = await versions.installServer({
    dir,
    mc: "26.1",
    loader: "fabric",
    onProgress: (p) => stages.push(`${p.percent}% ${p.stage}`),
  });
  const files = fs.readdirSync(dir).map((f) => `${f} ${(fs.statSync(path.join(dir, f)).size / 1024).toFixed(0)}KB`);
  console.log("install:", JSON.stringify(res), "| files:", files.join(", "));
  console.log("stages:", stages.slice(0, 4).join(" → "));

  // 再跑一次：应命中缓存（不发请求）
  const again = await versions.installServer({ dir, mc: "26.1", loader: "fabric" });
  console.log("second run:", JSON.stringify(again));
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
})().catch((e) => console.error("FAIL", e.message));
