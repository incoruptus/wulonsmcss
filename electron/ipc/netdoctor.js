/**
 * 网络体检（Net Doctor）
 * ------------------------------------------------------------
 * 回答三个「为什么朋友连不上」的问题：
 *   1. 我这台机器到底有哪些地址（公网 v4 / v6、局域网、虚拟网卡）？
 *   2. NAT 是什么类型（cone 还能打洞，symmetric 基本只能走中继）？
 *   3. 路由器支不支持 UPnP、外部 IP 是多少（能不能自己开端口）？
 *
 * 全部零依赖：STUN/UDP 手写，UPnP 走 SSDP + SOAP。
 * 注意：这里只做「探测」，不替用户改路由器；映射是单独的显式动作。
 */

const dgram = require("dgram");
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");

const VIRTUAL = /vEthernet|VMware|VirtualBox|Hyper-V|WSL|Tailscale|ZeroTier|WireGuard|TAP|Radmin|Loopback/i;
const STUN_SERVERS = [
  { host: "stun.cloudflare.com", port: 3478 },
  { host: "stun.l.google.com", port: 19302 },
];

function isVirtualName(name) {
  return VIRTUAL.test(name || "");
}

/** 本机网卡（含虚拟网卡标记；UI 会解释「这条不是给朋友用的」） */
function interfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== "IPv4" && net.family !== "IPv6") continue;
      out.push({
        name,
        address: net.address,
        family: net.family,
        internal: Boolean(net.internal),
        virtual: isVirtualName(name),
      });
    }
  }
  // 真实的、非虚拟的排前面；IPv4 优先
  out.sort((a, b) => Number(a.virtual) - Number(b.virtual) || Number(a.internal) - Number(b.internal) || (a.family === "IPv4" ? -1 : 1));
  return out;
}

/** 默认路由走哪张网卡；拿不到再退回 192.168 → 10 → 172.16/12 */
function lanAddress() {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    let settled = false;
    const finish = (ip) => {
      if (settled) return;
      settled = true;
      try {
        sock.close();
      } catch {}
      resolve(ip || fallbackLan());
    };
    const timer = setTimeout(() => finish(""), 600);
    sock.on("error", () => {
      clearTimeout(timer);
      finish("");
    });
    try {
      sock.connect(80, "8.8.8.8", () => {
        clearTimeout(timer);
        try {
          finish(sock.address().address);
        } catch {
          finish("");
        }
      });
    } catch {
      clearTimeout(timer);
      finish("");
    }
  });
}

function fallbackLan() {
  const list = interfaces().filter((n) => !n.internal && n.family === "IPv4" && !n.virtual);
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
  return list.sort((a, b) => rank(a.address) - rank(b.address))[0]?.address || "127.0.0.1";
}

/* ---------------- STUN ---------------- */

const MAGIC = 0x2112a442;

function stunRequest(tx) {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(0x0001, 0); // Binding Request
  buf.writeUInt16BE(0, 2);
  buf.writeUInt32BE(MAGIC, 4);
  tx.copy(buf, 8);
  return buf;
}

/** 解 XOR-MAPPED-ADDRESS（优先）或 MAPPED-ADDRESS；解析失败返回 null */
function parseStunResponse(msg, tx) {
  if (!Buffer.isBuffer(msg) || msg.length < 20) return null;
  if (msg.readUInt16BE(0) !== 0x0101) return null;
  const len = Math.min(msg.readUInt16BE(2), msg.length - 20);
  let i = 20;
  let fallback = null;
  const end = 20 + len;
  while (i + 4 <= end) {
    const type = msg.readUInt16BE(i);
    const alen = msg.readUInt16BE(i + 2);
    const val = msg.subarray(i + 4, Math.min(i + 4 + alen, msg.length));
    if (type === 0x0020 && val.length >= 8) {
      const family = val[1];
      if (family !== 0x01) return null; // IPv6 先不算：MC 直连用 v4 端口映射的场景最多
      const port = val.readUInt16BE(2) ^ (MAGIC >>> 16);
      const ip = Buffer.from(val.subarray(4, 8));
      for (let k = 0; k < 4; k += 1) ip[k] ^= (MAGIC >>> (24 - k * 8)) & 0xff;
      return { ip: `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`, port };
    }
    if (type === 0x0001 && val.length >= 8 && !fallback) {
      const port = val.readUInt16BE(2);
      const ip = val.subarray(4, 8);
      fallback = { ip: `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`, port };
    }
    i += 4 + alen + ((4 - (alen % 4)) % 4);
  }
  return fallback;
}

function stunProbe({ host, port = 3478 }, timeoutMs = 1600) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const tx = crypto.randomBytes(12);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        sock.close();
      } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => finish({ host, ok: false, error: "STUN 超时" }), timeoutMs);
    sock.on("message", (msg) => {
      const mapped = parseStunResponse(msg, tx);
      clearTimeout(timer);
      if (!mapped) finish({ host, ok: false, error: "STUN 响应无法解析" });
      else finish({ host, ok: true, mapped: `${mapped.ip}:${mapped.port}`, ip: mapped.ip, port: mapped.port });
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      finish({ host, ok: false, error: e.message });
    });
    try {
      sock.send(stunRequest(tx), port, host, (err) => {
        if (err) {
          clearTimeout(timer);
          finish({ host, ok: false, error: err.message });
        }
      });
    } catch (e) {
      clearTimeout(timer);
      finish({ host, ok: false, error: e.message });
    }
  });
}

/** 两个 STUN 服务器返回的映射端口一致 → cone；不一致 → symmetric（打洞基本没戏） */
function natKind(servers) {
  const ok = servers.filter((s) => s.ok && s.ip && s.port);
  if (ok.length < 2) return "unknown";
  return ok[0].ip === ok[1].ip && ok[0].port === ok[1].port ? "cone" : "symmetric";
}

async function stunReport() {
  const servers = await Promise.all(STUN_SERVERS.map((s) => stunProbe(s)));
  const first = servers.find((s) => s.ok) ?? null;
  return {
    ok: Boolean(first),
    mapped: first ? first.mapped : undefined,
    ip: first?.ip,
    nat: natKind(servers),
    servers,
    error: first ? undefined : servers[0]?.error || "STUN 不可用（UDP 可能被拦）",
  };
}

/* ---------------- 公网 IP ---------------- */

function httpText(url, timeoutMs) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: timeoutMs, headers: { "user-agent": "mcss-netdoctor" } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        resolve(null);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => {
        if (body.length < 4096) body += d;
      });
      res.on("end", () => resolve(body.trim()));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

async function publicIps() {
  const [v4, v6, fallback] = await Promise.all([
    httpText("https://ipv4.icanhazip.com", 3500),
    httpText("https://ipv6.icanhazip.com", 3500),
    httpText("https://ipinfo.io/json", 3500),
  ]);
  let ipv4 = v4 && /^\d{1,3}(\.\d{1,3}){3}$/.test(v4) ? v4 : null;
  let ipv6 = v6 && v6.includes(":") ? v6 : null;
  if (!ipv4 && fallback) {
    try {
      const parsed = JSON.parse(fallback);
      if (typeof parsed.ip === "string" && !parsed.ip.includes(":")) ipv4 = parsed.ip;
    } catch {}
  }
  return { v4: ipv4, v6: ipv6 };
}

/* ---------------- UPnP ---------------- */

function ssdpSearch(timeoutMs = 1800) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const message = Buffer.from(
      [
        "M-SEARCH * HTTP/1.1",
        "HOST: 239.255.255.250:1900",
        'MAN: "ssdp:discover"',
        "MX: 2",
        "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1",
        "",
        "",
      ].join("\r\n"),
    );
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        sock.close();
      } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.on("message", (msg) => {
      const text = msg.toString("utf8");
      const loc = /^location:\s*(.+)$/im.exec(text);
      if (loc) {
        clearTimeout(timer);
        finish(loc[1].trim());
      }
    });
    sock.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    try {
      sock.send(message, 1900, "239.255.255.250", (err) => {
        if (err) {
          clearTimeout(timer);
          finish(null);
        }
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/** 从 rootDesc 里找 WANIPConnection / WANPPPConnection 的 controlURL 和 serviceType（优先 WANIP） */
function parseRootDesc(xml, location) {
  if (!xml) return null;
  const blocks = [...String(xml).matchAll(/<service>([\s\S]*?)<\/service>/gi)].map((m) => m[1]);
  let ppp = null;
  for (const block of blocks) {
    const serviceType = /<serviceType>\s*([^<]+?)\s*<\/serviceType>/i.exec(block)?.[1];
    const controlURL = /<controlURL>\s*([^<]+?)\s*<\/controlURL>/i.exec(block)?.[1];
    if (!serviceType || !/WAN(IP|PPP)Connection/i.test(serviceType) || !controlURL) continue;
    let base;
    try {
      const u = new URL(location);
      base = `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
    const control = /^https?:\/\//i.test(controlURL) ? controlURL : `${base}${controlURL.startsWith("/") ? "" : "/"}${controlURL}`;
    const item = { serviceType, controlURL: control };
    if (/WANIPConnection/i.test(serviceType)) return item;
    if (!ppp) ppp = item;
  }
  return ppp;
}

function soapEnvelope(serviceType, action, params) {
  return (
    `<?xml version="1.0"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${serviceType}">${params || ""}</u:${action}></s:Body></s:Envelope>`
  );
}

function soapRequest(controlURL, serviceType, action, extraBody, timeoutMs = 3000) {
  const body = soapEnvelope(serviceType, action, extraBody);
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(controlURL);
    } catch {
      resolve(null);
      return;
    }
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": 'text/xml; charset="utf-8"',
          SOAPAction: `"${serviceType}#${action}"`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d) => {
          if (text.length < 8192) text += d;
        });
        res.on("end", () => resolve(text));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

async function discoverGateway() {
  const location = await ssdpSearch();
  if (!location) return { error: "路由器没有响应 SSDP（可能没开 UPnP）" };
  const xml = await httpText(location, 2500);
  const service = parseRootDesc(xml, location);
  if (!service) return { error: "网关没有 WANIPConnection 服务", location };
  return { location, ...service };
}

function gatewayHost(location) {
  try {
    return new URL(location).host;
  } catch {
    return location;
  }
}

function faultOf(xml) {
  const code = /<errorCode>\s*(\d+)\s*<\/errorCode>/i.exec(xml || "")?.[1];
  const desc = /<errorDescription>\s*([^<]*?)\s*<\/errorDescription>/i.exec(xml || "")?.[1];
  if (!code) return "";
  return `路由器拒绝（${code}${desc ? ` ${desc}` : ""}）`;
}

async function upnpReport() {
  const gw = await discoverGateway();
  if (gw.error) return { available: false, error: gw.error, gateway: gw.location ? gatewayHost(gw.location) : undefined };

  const soap = await soapRequest(gw.controlURL, gw.serviceType, "GetExternalIPAddress");
  const externalIp = /<NewExternalIPAddress>\s*([^<]*?)\s*<\/NewExternalIPAddress>/i.exec(soap || "")?.[1] || undefined;

  return {
    available: true,
    gateway: gatewayHost(gw.location),
    externalIp: externalIp && externalIp !== "0.0.0.0" ? externalIp : undefined,
    serviceType: gw.serviceType,
    controlURL: gw.controlURL,
  };
}

/** 在路由器上开一条 TCP 端口映射（只在用户显式点击时调用） */
async function upnpMap(port, lanIp) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, error: "端口不合法" };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(lanIp || "")) return { ok: false, error: "没有可用的局域网 IPv4 地址" };

  const gw = await discoverGateway();
  if (gw.error) return { ok: false, error: gw.error };

  const params =
    `<NewRemoteHost></NewRemoteHost>` +
    `<NewExternalPort>${p}</NewExternalPort>` +
    `<NewProtocol>TCP</NewProtocol>` +
    `<NewInternalPort>${p}</NewInternalPort>` +
    `<NewInternalClient>${lanIp}</NewInternalClient>` +
    `<NewEnabled>1</NewEnabled>` +
    `<NewPortMappingDescription>Wulons MCSS</NewPortMappingDescription>` +
    `<NewLeaseDuration>0</NewLeaseDuration>`;

  const res = await soapRequest(gw.controlURL, gw.serviceType, "AddPortMapping", params);
  if (!res) return { ok: false, error: "路由器没有响应映射请求" };
  if (/<errorCode>/i.test(res)) return { ok: false, error: faultOf(res) || "路由器拒绝映射" };

  const ipRes = await soapRequest(gw.controlURL, gw.serviceType, "GetExternalIPAddress", "");
  const externalIp = /<NewExternalIPAddress>\s*([^<]*?)\s*<\/NewExternalIPAddress>/i.exec(ipRes || "")?.[1];
  return { ok: true, externalIp: externalIp && externalIp !== "0.0.0.0" ? externalIp : undefined, externalPort: p };
}

/** 撤销上面那条映射；只删 TCP，不碰路由器里别的规则 */
async function upnpUnmap(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, error: "端口不合法" };

  const gw = await discoverGateway();
  if (gw.error) return { ok: false, error: gw.error };

  const params = `<NewRemoteHost></NewRemoteHost><NewExternalPort>${p}</NewExternalPort><NewProtocol>TCP</NewProtocol>`;
  const res = await soapRequest(gw.controlURL, gw.serviceType, "DeletePortMapping", params);
  if (!res) return { ok: false, error: "路由器没有响应撤销请求" };
  if (/<errorCode>/i.test(res)) return { ok: false, error: faultOf(res) || "路由器拒绝撤销" };
  return { ok: true };
}

/* ---------------- 汇总 ---------------- */

async function doctor() {
  const [ips, stun, upnp] = await Promise.all([publicIps(), stunReport(), upnpReport()]);
  return {
    at: Date.now(),
    interfaces: interfaces(),
    publicV4: ips.v4,
    publicV6: ips.v6,
    stun,
    upnp,
  };
}

module.exports = {
  doctor,
  lanAddress,
  interfaces,
  publicIps,
  stunReport,
  upnpReport,
  upnpMap,
  upnpUnmap,
  // 给测试用
  parseStunResponse,
  stunRequest,
  natKind,
  parseRootDesc,
  soapEnvelope,
  faultOf,
};
