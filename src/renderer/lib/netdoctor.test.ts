import { describe, expect, it } from "vitest";
import { describeDoctor, physicalLan, virtualCount } from "./netdoctor";
import type { NetDoctor } from "./types";

const BASE: NetDoctor = {
  at: 0,
  interfaces: [
    { name: "vEthernet (WSL)", address: "172.22.32.15", family: "IPv4", internal: false, virtual: true },
    { name: "WLAN", address: "192.168.1.5", family: "IPv4", internal: false, virtual: false },
    { name: "Loopback", address: "127.0.0.1", family: "IPv4", internal: true, virtual: false },
  ],
  publicV4: "203.0.113.7",
  publicV6: null,
  stun: { ok: true, nat: "cone", servers: [] },
  upnp: { available: true, externalIp: "203.0.113.7" },
};

describe("网络体检结论", () => {
  it("优先拿真实网卡，虚拟网卡单独计数", () => {
    expect(physicalLan(BASE.interfaces)).toBe("192.168.1.5");
    expect(virtualCount(BASE.interfaces)).toBe(1);
  });

  it("对称 NAT 直接劝退直连", () => {
    const advice = describeDoctor({ ...BASE, stun: { ...BASE.stun, nat: "symmetric" } });
    expect(advice.tone).toBe("amber");
    expect(advice.title).toContain("对称");
  });

  it("能打洞 + UPnP → 有直连机会", () => {
    const advice = describeDoctor(BASE);
    expect(advice.tone).toBe("green");
    expect(advice.detail).toContain("25565");
  });

  it("能打洞但没 UPnP → 手动映射或隧道", () => {
    const advice = describeDoctor({ ...BASE, upnp: { available: false } });
    expect(advice.tone).toBe("amber");
    expect(advice.detail).toContain("手动");
  });

  it("测不出来就说测不出来", () => {
    const advice = describeDoctor({ ...BASE, stun: { ...BASE.stun, ok: false, nat: "unknown" }, upnp: { available: false } });
    expect(advice.tone).toBe("gray");
    expect(advice.title).toContain("没测出来");
  });

  it("没有数据不装懂", () => {
    expect(describeDoctor(null).tone).toBe("gray");
  });
});
