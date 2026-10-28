/**
 * 验证 agent 的客户端通道：add-server（NBT 合并）/ prepare（真实下载）/ export-mrpack
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28479;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "client-test";

async function invoke(channel, ...args) {
  const res = await fetch(`${BASE}/api/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mcss-token": TOKEN },
    body: JSON.stringify({ channel, args }),
  });
  return res.json();
}

async function waitHealth(ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

(async () => {
  const agent = spawn(EXE, [], {
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: path.join(ROOT, "config.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-agent-client-"));
  const serversdat = require(path.join(ROOT, "electron", "ipc", "serversdat.js"));

  serversdat.addServer(dir, { name: "老服务器", ip: "old.example.com:25565" });
  serversdat.addServer(dir, { name: "另一个", ip: "1.1.1.1:25565" });
  const added = await invoke("client:add-server", { mcDir: dir, name: "新服务器", ip: "new.example.com:25565" });
  console.log("add-server count:", added.result?.count);
  console.log("merged:", JSON.stringify(serversdat.parse(fs.readFileSync(path.join(dir, "servers.dat"))).map((s) => s.name)));

  const prepared = await invoke("client:prepare", {
    dir,
    mods: [{ p: "AANobbMI", v: "uGvVQBnw", n: "Sodium" }],
  });
  console.log("prepare ok:", prepared.result?.ok, "| mods:", fs.readdirSync(path.join(dir, "mods")));

  const out = path.join(dir, "room.mrpack");
  const exported = await invoke("client:export-mrpack", {
    outFile: out,
    room: {
      name: "朋友的生存服",
      mc: "26.1",
      loader: "fabric",
      lv: "0.20.1",
      addr: "frp.example.com:25565",
      mods: [{ p: "AANobbMI", v: "uGvVQBnw", n: "Sodium" }],
    },
  });
  console.log("mrpack:", JSON.stringify(exported.result));
  if (fs.existsSync(out)) {
    console.log("entries:", execFileSync("tar", ["-tf", out], { encoding: "utf8" }).trim().split("\n").join(", "));
    const idx = JSON.parse(execFileSync("tar", ["-xOf", out, "modrinth.index.json"], { encoding: "utf8" }));
    console.log("deps:", JSON.stringify(idx.dependencies), "| files:", idx.files.map((f) => f.path).join(","));
    const sd = execFileSync("tar", ["-xOf", out, "overrides/servers.dat"], { encoding: "buffer" });
    console.log("servers.dat:", JSON.stringify(serversdat.parse(sd)));
  }

  agent.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 300));
  process.exitCode = 0;
})();
