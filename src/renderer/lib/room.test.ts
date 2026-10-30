import { describe, expect, it } from "vitest";
import { decodeRoom, encodeRoom, extractCode, roomDeepLink, roomInstallLink, roomShareText, roomWebLink, type RoomDescriptorV1 } from "./room";

const ROOM: RoomDescriptorV1 = {
  v: 1,
  name: "朋友的小服",
  addr: "frp.example.com:25565",
  mc: "26.1",
  loader: "fabric",
  mods: [
    { p: "AANobbMI", v: "abc12345", n: "Sodium" },
    { p: "P7dR8mSH", v: "def67890", n: "Fabric API" },
  ],
};

describe("房间描述符", () => {
  it("内网地址随房间码一起带走", async () => {
    const code = await encodeRoom({ ...ROOM, lan: "192.168.1.9:25565" });
    const back = await decodeRoom(code);
    expect(back.lan).toBe("192.168.1.9:25565");
    expect(back.addr).toBe(ROOM.addr);
  });

  it("候选地址随房间码一起带走", async () => {
    const code = await encodeRoom({
      ...ROOM,
      addrs: [
        { k: "lan", host: "192.168.1.9", port: 25565 },
        { k: "tunnel", host: "frp.example.com", port: 25565 },
      ],
    });
    const back = await decodeRoom(code);
    expect(back.addrs).toHaveLength(2);
    expect(back.addrs?.[0].k).toBe("lan");
  });

  it("分享文案把外网和同 WiFi 两条路都写清楚", async () => {
    const code = await encodeRoom({ ...ROOM, lan: "192.168.1.9:25565" });
    const text = roomShareText({ ...ROOM, lan: "192.168.1.9:25565" }, code);
    expect(text).toContain("外网");
    expect(text).toContain("同一 WiFi");
  });

  it("没有内网地址时也能正常解码（旧码兼容）", async () => {
    const code = await encodeRoom(ROOM);
    expect((await decodeRoom(code)).lan).toBeUndefined();
  });

  it("深链与一键准备好链接分开", () => {
    expect(roomDeepLink("w1z.abc.def")).toBe("mcss://join/w1z.abc.def");
    expect(roomInstallLink("w1z.abc.def")).toBe("mcss://install/w1z.abc.def");
  });

  it("编码 → 解码能还原", async () => {
    const code = await encodeRoom(ROOM);
    const back = await decodeRoom(code);
    expect(back.name).toBe(ROOM.name);
    expect(back.addr).toBe(ROOM.addr);
    expect(back.mods).toHaveLength(2);
    expect(back.mods[0].n).toBe("Sodium");
  });

  it("房间码足够短（链接可直接发）", async () => {
    const code = await encodeRoom(ROOM);
    expect(code.length).toBeLessThan(400);
    expect(code).toMatch(/^w1[zp]\./);
  });

  it("能从网页链接 / 深链 / 纯码里提取", async () => {
    const code = await encodeRoom(ROOM);
    for (const input of [roomWebLink(code, "https://example.test"), roomDeepLink(code), code, `  房间码：${code}  `]) {
      expect(extractCode(input)).toBe(code);
      const room = await decodeRoom(input);
      expect(room.addr).toBe(ROOM.addr);
    }
  });

  it("被改坏一位会校验失败", async () => {
    const code = await encodeRoom(ROOM);
    // 改中间一位（动末尾可能只影响 base64 填充位，解出的字节不变）
    const idx = Math.floor(code.length * 0.6);
    const ch = code[idx] === "A" ? "B" : "A";
    const broken = code.slice(0, idx) + ch + code.slice(idx + 1);
    await expect(decodeRoom(broken)).rejects.toThrow(/校验|损坏|有效|解析/);
  });

  it("过期房间会被拒绝", async () => {
    const code = await encodeRoom({ ...ROOM, exp: Date.now() - 1000 });
    await expect(decodeRoom(code)).rejects.toThrow(/过期/);
  });

  it("没有网页地址时不伪造 404 链接，只发房间码", async () => {
    const code = await encodeRoom(ROOM);
    const text = roomShareText(ROOM, code);
    expect(text).not.toContain("http");
    expect(text).toContain("房间码");
    expect(text).toContain("加入游戏");
  });

  it("有部署地址时，邀请里带正确的 join 链接", async () => {
    const code = await encodeRoom(ROOM);
    const text = roomShareText(ROOM, code, "https://mcss.example.com/sub");
    expect(text).toContain(`https://mcss.example.com/sub/#/join/${code}`);
  });

  it("乱输入给中文错误", async () => {
    await expect(decodeRoom("hello")).rejects.toThrow(/没认出|有效/);
    expect(() => extractCode("")).toThrow();
  });
});
