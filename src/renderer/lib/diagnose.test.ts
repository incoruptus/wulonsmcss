import { describe, expect, it } from "vitest";
import { buildDiagnostic, decodeDiagnostic, diagnosticHeadline, diagnosticNext, encodeDiagnostic, type DiagnosticV1 } from "./diagnose";
import type { ReachReport } from "./reach";

const ROOM = { v: 1 as const, name: "周末小服", addr: "frp.example.com:25565", mc: "26.1", loader: "fabric", mods: [] };

const REACH: ReachReport = {
  at: 1,
  port: 25565,
  lanIp: "192.168.1.5",
  publicV4: "1.2.3.4",
  publicV6: null,
  tunnel: "frp.example.com:25565",
  probes: [
    {
      target: { kind: "lan", host: "192.168.1.5", port: 25565 },
      addr: "192.168.1.5:25565",
      ok: false,
      checked: true,
      ms: 1200,
      via: "local",
      error: "连接超时",
    },
    {
      target: { kind: "tunnel", host: "frp.example.com", port: 25565 },
      addr: "frp.example.com:25565",
      ok: true,
      checked: true,
      ms: 48,
      via: "local",
    },
  ],
};

describe("诊断码", () => {
  it("编码 → 解码能还原现场", async () => {
    const diag = buildDiagnostic({
      room: ROOM,
      reach: REACH,
      checkup: {
        dir: "C:\\Users\\A\\.minecraft",
        exists: true,
        match: null,
        candidates: [{ id: "1.21.1-fabric", mcVersion: "1.21.1", loader: "fabric" }],
        mods: { total: 3, present: 1, missing: [{ p: "sodium", v: "1", n: "Sodium" }] },
        verdict: "need-version",
      },
      launchers: [{ name: "HMCL" }],
      note: "点了启动没反应",
    });
    const code = await encodeDiagnostic(diag);
    expect(code).toMatch(/^d1[zp]\./);

    const back = await decodeDiagnostic(`朋友发的：${code}`);
    expect(back.room.name).toBe("周末小服");
    expect(back.probes).toHaveLength(2);
    expect(back.client?.missing).toEqual(["Sodium"]);
    expect(back.launchers).toEqual(["HMCL"]);
    expect(back.note).toBe("点了启动没反应");
  });

  it("被改坏一位会校验失败", async () => {
    const code = await encodeDiagnostic(buildDiagnostic({ room: ROOM }));
    const idx = Math.floor(code.length * 0.7);
    const broken = code.slice(0, idx) + (code[idx] === "A" ? "B" : "A") + code.slice(idx + 1);
    await expect(decodeDiagnostic(broken)).rejects.toThrow(/校验|损坏|有效/);
  });

  it("乱输入给中文错误", async () => {
    await expect(decodeDiagnostic("hello")).rejects.toThrow(/无法识别诊断码/);
  });

  it("结论按最可能的原因说话", () => {
    const offline = buildDiagnostic({ room: ROOM, reach: { ...REACH, probes: REACH.probes.map((p) => ({ ...p, ok: false })) } });
    expect(diagnosticHeadline(offline)).toContain("未能连接任何地址");
    expect(diagnosticNext(offline).action).toBe("network");

    const missingMods = buildDiagnostic({
      room: ROOM,
      reach: REACH,
      checkup: {
        dir: "C:\\mc",
        exists: true,
        match: null,
        candidates: [],
        mods: { total: 2, present: 0, missing: [{ p: "a", v: "1", n: "A" }] },
        verdict: "need-mods",
      },
    });
    expect(diagnosticHeadline(missingMods)).toContain("缺少 1 个模组");
    expect(diagnosticNext(missingMods).title).toContain("补齐模组");
  });
});
