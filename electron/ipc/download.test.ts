import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { download, hashFile } = require("./download.js") as {
  download: (opts: Record<string, unknown>) => Promise<{ ok: boolean; path: string; bytes: number; cached?: boolean }>;
  hashFile: (file: string, algorithm?: string) => Promise<string>;
};

const PAYLOAD = Buffer.alloc(256 * 1024, 7);
const SHA1 = crypto.createHash("sha1").update(PAYLOAD).digest("hex");

const servers: http.Server[] = [];

function serve(handler: http.RequestListener): Promise<{ port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.keepAliveTimeout = 1;
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as { port: number }).port }));
  });
}

/** 支持 Range 的正常服务端 */
const rangeAware: http.RequestListener = (req, res) => {
  const range = req.headers.range;
  if (range) {
    const start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0);
    res.writeHead(206, {
      "content-length": PAYLOAD.length - start,
      "content-range": `bytes ${start}-${PAYLOAD.length - 1}/${PAYLOAD.length}`,
    });
    res.end(PAYLOAD.subarray(start));
    return;
  }
  res.writeHead(200, { "content-length": PAYLOAD.length });
  res.end(PAYLOAD);
};

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcss-dl-")), "file.bin");

afterAll(() => {
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
});

describe("下载器", () => {
  it("正常下载并通过哈希校验", async () => {
    const { port } = await serve(rangeAware);
    const dest = tmpFile();
    const res = await download({ url: `http://127.0.0.1:${port}/f`, dest, hash: { sha1: SHA1 } });
    expect(res.cached).toBeUndefined();
    expect(fs.readFileSync(dest).length).toBe(PAYLOAD.length);
    expect(await hashFile(dest)).toBe(SHA1);
  });

  it("第二次调用命中缓存，不再请求网络", async () => {
    let hits = 0;
    const { port } = await serve((req, res) => {
      hits += 1;
      rangeAware(req, res);
    });
    const dest = tmpFile();
    await download({ url: `http://127.0.0.1:${port}/f`, dest, hash: { sha1: SHA1 } });
    const again = await download({ url: `http://127.0.0.1:${port}/f`, dest, hash: { sha1: SHA1 } });
    expect(again.cached).toBe(true);
    expect(hits).toBe(1);
  });

  it("有 .part 时用 Range 续传", async () => {
    let sawRange: string | null = null;
    const { port } = await serve((req, res) => {
      sawRange = (req.headers.range as string) ?? null;
      rangeAware(req, res);
    });
    const dest = tmpFile();
    const half = PAYLOAD.length / 2;
    fs.writeFileSync(`${dest}.part`, PAYLOAD.subarray(0, half));

    await download({ url: `http://127.0.0.1:${port}/f`, dest, hash: { sha1: SHA1 } });
    expect(sawRange).toBe(`bytes=${half}-`);
    expect(fs.readFileSync(dest).length).toBe(PAYLOAD.length);
  });

  it("服务端不支持 Range 时从头重下", async () => {
    let sawRange: string | null = null;
    const { port } = await serve((req, res) => {
      sawRange = (req.headers.range as string) ?? null;
      res.writeHead(200, { "content-length": PAYLOAD.length });
      res.end(PAYLOAD);
    });
    const dest = tmpFile();
    fs.writeFileSync(`${dest}.part`, Buffer.alloc(1024));

    await download({ url: `http://127.0.0.1:${port}/f`, dest, hash: { sha1: SHA1 } });
    expect(sawRange).toBe("bytes=1024-");
    expect(fs.readFileSync(dest).length).toBe(PAYLOAD.length);
  });

  it("第一个源内容损坏时自动换下一个源", async () => {
    const bad = await serve((_req, res) => {
      const wrong = Buffer.alloc(PAYLOAD.length, 9);
      res.writeHead(200, { "content-length": wrong.length });
      res.end(wrong);
    });
    const good = await serve(rangeAware);
    const dest = tmpFile();
    const retries: string[] = [];

    const res = await download({
      url: "http://127.0.0.1:1/f",
      mirrors: [`http://127.0.0.1:${bad.port}/`, `http://127.0.0.1:${good.port}/`],
      dest,
      hash: { sha1: SHA1 },
      onRetry: (_u: string, msg: string) => retries.push(msg),
    });

    expect(await hashFile(dest)).toBe(SHA1);
    expect(retries.some((m) => m.includes("校验不通过"))).toBe(true);
    expect(res.ok).toBe(true);
  });

  it("全部源都失败时抛错且不留半成品在目标路径", async () => {
    const bad = await serve((_req, res) => {
      res.writeHead(500);
      res.end("nope");
    });
    const dest = tmpFile();
    await expect(download({ url: `http://127.0.0.1:${bad.port}/f`, dest, hash: { sha1: SHA1 } })).rejects.toThrow(/HTTP 500/);
    expect(fs.existsSync(dest)).toBe(false);
  });
});
