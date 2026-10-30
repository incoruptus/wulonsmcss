import { describe, expect, it } from "vitest";
import {
  chooseBest,
  formatAddr,
  hostSummary,
  hostVerdict,
  kindLabel,
  mergeTargets,
  parseAddr,
  playerVerdict,
  primaryAddress,
  probeText,
  roomAddrsFrom,
  sortTargets,
  targetsFromRoom,
  type ReachKind,
  type ReachProbe,
} from "./reach";

function probe(kind: ReachKind, ok: boolean, ms?: number, checked = true): ReachProbe {
  return {
    target: { kind, host: `${kind}.test`, port: 25565 },
    addr: `${kind}.test:25565`,
    ok,
    checked,
    ms,
    via: "local",
  };
}

describe("地址解析", () => {
  it("IPv4 / 域名 / 端口", () => {
    expect(parseAddr("1.2.3.4:25566")).toEqual({ host: "1.2.3.4", port: 25566 });
    expect(parseAddr("example.com:25565")).toEqual({ host: "example.com", port: 25565 });
    expect(parseAddr("example.com")).toEqual({ host: "example.com", port: 25565 });
  });

  it("IPv6 带方括号才能写端口，裸地址用默认端口", () => {
    expect(parseAddr("[2001:db8::1]:25565")).toEqual({ host: "2001:db8::1", port: 25565 });
    expect(parseAddr("2001:db8::1")).toEqual({ host: "2001:db8::1", port: 25565 });
    expect(formatAddr("2001:db8::1", 25565)).toBe("[2001:db8::1]:25565");
  });

  it("坏地址返回 null", () => {
    expect(parseAddr("")).toBeNull();
    expect(parseAddr("host:0")).toBeNull();
    expect(parseAddr("host:99999")).toBeNull();
  });
});

describe("候选地址", () => {
  it("按 host:port 去重，先出现的优先", () => {
    const merged = mergeTargets([
      [{ kind: "lan", host: "192.168.1.2", port: 25565 }],
      [{ kind: "tunnel", host: "192.168.1.2", port: 25565 }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe("lan");
  });

  it("排序：局域网 → IPv6 → 公网 → 隧道", () => {
    const sorted = sortTargets([
      { kind: "tunnel", host: "t", port: 1 },
      { kind: "public", host: "p", port: 1 },
      { kind: "lan", host: "l", port: 1 },
      { kind: "ipv6", host: "v", port: 1 },
    ]);
    expect(sorted.map((t) => t.kind)).toEqual(["lan", "ipv6", "public", "tunnel"]);
  });

  it("老房间码（只有 lan + addr）也能还原两条", () => {
    const targets = targetsFromRoom({ addr: "frp.example.com:25565", lan: "192.168.1.5:25565" });
    expect(targets.map((t) => t.kind)).toEqual(["lan", "manual"]);
  });

  it("新房间码用 addrs，重复的 addr 不会被当成第三条", () => {
    const targets = targetsFromRoom({
      addr: "frp.example.com:25565",
      addrs: [
        { k: "lan", host: "192.168.1.5", port: 25565 },
        { k: "tunnel", host: "frp.example.com", port: 25565 },
      ],
    });
    expect(targets.map((t) => t.kind)).toEqual(["lan", "tunnel"]);
  });

  it("未知的 k 当手动地址处理", () => {
    const targets = targetsFromRoom({ addr: "", addrs: [{ k: "weird", host: "x.test", port: 25565 }] });
    expect(targets[0].kind).toBe("manual");
  });
});

describe("竞速与结论", () => {
  it("局域网优先，哪怕隧道更快", () => {
    const best = chooseBest([probe("tunnel", true, 5), probe("lan", true, 40)]);
    expect(best?.target.kind).toBe("lan");
  });

  it("没验证过的不算数", () => {
    expect(chooseBest([probe("lan", true, 3, false)])).toBeNull();
    expect(primaryAddress([probe("tunnel", true, 3, false)])).toBeNull();
  });

  it("邀请主地址优先选覆盖面最广的", () => {
    expect(primaryAddress([probe("lan", true, 3), probe("tunnel", true, 60)])).toBe("tunnel.test:25565");
    expect(primaryAddress([probe("lan", true, 3), probe("public", true, 40)])).toBe("public.test:25565");
    expect(primaryAddress([probe("lan", true, 3)])).toBe("lan.test:25565");
  });

  it("服主结论：公网 > 隧道 > 仅局域网 > 离线 > 未知", () => {
    expect(hostVerdict([probe("lan", true), probe("tunnel", true), probe("public", true)])).toBe("public");
    expect(hostVerdict([probe("lan", true), probe("tunnel", true)])).toBe("tunnel");
    expect(hostVerdict([probe("lan", true), probe("public", false)])).toBe("lan-only");
    expect(hostVerdict([probe("local", true), probe("lan", false)])).toBe("local-only");
    expect(hostVerdict([probe("local", false), probe("lan", false), probe("public", false)])).toBe("offline");
    expect(hostVerdict([probe("public", false, undefined, false)])).toBe("unknown");
    expect(hostVerdict([])).toBe("unknown");
  });

  it("玩家结论只看真正探测过的", () => {
    expect(playerVerdict([probe("lan", false), probe("tunnel", false)])).toBe("offline");
    expect(playerVerdict([probe("lan", false, undefined, false)])).toBe("unknown");
    expect(playerVerdict([probe("lan", true)])).toBe("ready");
  });

  it("房间码只带验证通过的地址", () => {
    const refs = roomAddrsFrom([probe("tunnel", true), probe("lan", true), probe("public", false), probe("local", true)]);
    expect(refs.map((r) => r.k)).toEqual(["lan", "tunnel"]);
  });

  it("文案说人话", () => {
    expect(hostSummary("lan-only").title).toContain("局域网");
    expect(probeText(probe("lan", true, 12))).toBe("已连通 · 12ms");
    expect(probeText(probe("lan", false))).toBe("连不上");
    expect(kindLabel("tunnel")).toBe("隧道");
  });
});
