import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildMegaPack, buildWorldPack, type WorldConfig } from "./mwm";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const CLI = path.join(ROOT, "wulons-mcss-mwm", "src", "cli.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mwm-eq-"));

const worlds: WorldConfig[] = [
  { name: "sky", label: "空岛", type: "void", description: "空岛世界" },
  { name: "flat2", label: "超平坦", type: "superflat", structures: false },
  { name: "hell", label: "地狱", type: "nether", biome_preset: "minecraft:nether" },
];

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function runCli(): string {
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");
  fs.writeFileSync(configPath, JSON.stringify({ namespace: "wulons", worlds }, null, 2));
  execFileSync(process.execPath, [CLI, configPath, outDir], { cwd: ROOT, stdio: "ignore" });
  return outDir;
}

describe("共享 MWM 生成器与 CLI 输出一致", () => {
  it("单世界数据包逐文件相同", () => {
    const outDir = runCli();
    for (const world of worlds) {
      const pack = buildWorldPack(world, "wulons");
      const dir = path.join(outDir, pack.packName);
      expect(fs.existsSync(dir), `${pack.packName} 未由 CLI 生成`).toBe(true);
      for (const file of pack.files) {
        const actual = fs.readFileSync(path.join(dir, ...file.path.split("/")), "utf8");
        expect(actual, `${pack.packName}/${file.path}`).toBe(file.content);
      }
    }
  });

  it("合并包除 README 外一致", () => {
    const outDir = runCli();
    const mega = buildMegaPack(worlds, "wulons");
    const dir = path.join(outDir, mega.packName);
    for (const file of mega.files) {
      if (file.path === "README.txt") continue; // CLI 的 README 带生成时间戳
      const actual = fs.readFileSync(path.join(dir, ...file.path.split("/")), "utf8");
      expect(actual, `${mega.packName}/${file.path}`).toBe(file.content);
    }
  });

  it("未知世界类型直接报错", () => {
    expect(() => buildWorldPack({ name: "x", type: "not-a-type" }, "wulons")).toThrow(/未知的世界类型/);
  });
});
