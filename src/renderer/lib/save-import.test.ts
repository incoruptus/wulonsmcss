import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importSinglePlayerSave, type SaveFileApi } from "./save-import";

const api: SaveFileApi = {
  exists: async (p) => fs.existsSync(p),
  copy: async (src, dest) => fs.cpSync(src, dest, { recursive: true }),
  remove: async (p) => fs.rmSync(p, { recursive: true, force: true }),
};

describe("单人存档导入", () => {
  it("复制成 world、删掉 session.lock，原存档保留", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-save-"));
    const save = path.join(root, "saves", "我的世界");
    const server = path.join(root, "server");
    fs.mkdirSync(path.join(save, "region"), { recursive: true });
    fs.writeFileSync(path.join(save, "level.dat"), "LEVEL");
    fs.writeFileSync(path.join(save, "session.lock"), "LOCK");
    fs.writeFileSync(path.join(save, "region", "r.0.0.mca"), "REGION");

    const { worldDir } = await importSinglePlayerSave(api, save, server);
    expect(fs.readFileSync(path.join(worldDir, "level.dat"), "utf8")).toBe("LEVEL");
    expect(fs.readFileSync(path.join(worldDir, "region", "r.0.0.mca"), "utf8")).toBe("REGION");
    expect(fs.existsSync(path.join(worldDir, "session.lock"))).toBe(false);
    expect(fs.existsSync(path.join(save, "level.dat"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("目标已有 world 时拒绝覆盖", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-save-"));
    const save = path.join(root, "saves", "old");
    const server = path.join(root, "server");
    fs.mkdirSync(save, { recursive: true });
    fs.mkdirSync(path.join(server, "world"), { recursive: true });
    fs.writeFileSync(path.join(save, "level.dat"), "OLD");
    fs.writeFileSync(path.join(server, "world", "level.dat"), "DO-NOT-TOUCH");

    await expect(importSinglePlayerSave(api, save, server)).rejects.toThrow(/已经有 world/);
    expect(fs.readFileSync(path.join(server, "world", "level.dat"), "utf8")).toBe("DO-NOT-TOUCH");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
