/**
 * netdoctor 纯解析部分的测试：STUN 报文、NAT 判定、UPnP 服务解析。
 * 真正的 UDP/SSDP 需要真实网络，这里不 mock 那部分。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const nd = require("./netdoctor.js");

const MAGIC = 0x2112a442;

function stunResponse(ip, port, tx) {
  const attr = Buffer.alloc(12);
  attr.writeUInt16BE(0x0020, 0); // XOR-MAPPED-ADDRESS
  attr.writeUInt16BE(8, 2);
  attr[4] = 0;
  attr[5] = 0x01; // IPv4
  attr.writeUInt16BE(port ^ (MAGIC >>> 16), 6);
  const bytes = ip.split(".").map(Number);
  for (let i = 0; i < 4; i += 1) attr[8 + i] = bytes[i] ^ ((MAGIC >>> (24 - i * 8)) & 0xff);

  const head = Buffer.alloc(20);
  head.writeUInt16BE(0x0101, 0);
  head.writeUInt16BE(attr.length, 2);
  head.writeUInt32BE(MAGIC, 4);
  tx.copy(head, 8);
  return Buffer.concat([head, attr]);
}

test("STUN：解出 XOR-MAPPED-ADDRESS", () => {
  const tx = Buffer.alloc(12, 9);
  const msg = stunResponse("203.0.113.7", 25565, tx);
  assert.deepEqual(nd.parseStunResponse(msg, tx), { ip: "203.0.113.7", port: 25565 });
});

test("STUN：不是成功响应就返回 null", () => {
  assert.equal(nd.parseStunResponse(Buffer.alloc(4), Buffer.alloc(12)), null);
  const bad = Buffer.alloc(20);
  bad.writeUInt16BE(0x0111, 0);
  assert.equal(nd.parseStunResponse(bad, Buffer.alloc(12)), null);
});

test("NAT：两个服务器映射一致才是 cone", () => {
  assert.equal(nd.natKind([{ ok: true, ip: "1.1.1.1", port: 5000 }, { ok: true, ip: "1.1.1.1", port: 5000 }]), "cone");
  assert.equal(nd.natKind([{ ok: true, ip: "1.1.1.1", port: 5000 }, { ok: true, ip: "1.1.1.1", port: 5001 }]), "symmetric");
  assert.equal(nd.natKind([{ ok: true, ip: "1.1.1.1", port: 5000 }, { ok: false }]), "unknown");
  assert.equal(nd.natKind([]), "unknown");
});

test("UPnP：从 rootDesc 里找到 WANIPConnection 并拼出控制地址", () => {
  const xml = `
    <root><device><serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANPPPConnection:1</serviceType>
        <controlURL>/ctl/ppp</controlURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType>
        <controlURL>/ctl/ip</controlURL>
      </service>
    </serviceList></device></root>`;
  const service = nd.parseRootDesc(xml, "http://192.168.1.1:5000/rootDesc.xml");
  assert.equal(service.controlURL, "http://192.168.1.1:5000/ctl/ip");
  assert.match(service.serviceType, /WANIPConnection/);
});

test("UPnP：没有网关服务就返回 null", () => {
  assert.equal(nd.parseRootDesc("<root></root>", "http://192.168.1.1/root.xml"), null);
  assert.equal(nd.parseRootDesc("", "http://192.168.1.1/root.xml"), null);
});

test("UPnP：SOAP 请求带服务名、动作和参数", () => {
  const xml = nd.soapEnvelope(
    "urn:schemas-upnp-org:service:WANIPConnection:1",
    "AddPortMapping",
    "<NewExternalPort>25565</NewExternalPort><NewProtocol>TCP</NewProtocol>",
  );
  assert.match(xml, /AddPortMapping/);
  assert.match(xml, /WANIPConnection/);
  assert.match(xml, /<NewExternalPort>25565<\/NewExternalPort>/);
  assert.match(xml, /<NewProtocol>TCP<\/NewProtocol>/);
});

test("UPnP：错误码翻译成人话", () => {
  const fault = nd.faultOf("<errorCode>718</errorCode><errorDescription>ConflictInMappingEntry</errorDescription>");
  assert.match(fault, /718/);
  assert.match(fault, /ConflictInMappingEntry/);
  assert.equal(nd.faultOf(""), "");
});
