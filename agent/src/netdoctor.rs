//! 网络体检：网卡 / 公网 IP / NAT 类型 / UPnP 网关
//!
//! 与 Electron 侧 `electron/ipc/netdoctor.js` 保持同一份契约。
//! 只用 std + curl：STUN 和 SSDP 都是手写 UDP，UPnP 的 SOAP 走 curl。
//! 这里只探测，不改路由器；端口映射是另一个显式动作。

use crate::curl;
use crate::json::Json;
use std::net::{ToSocketAddrs, UdpSocket};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAGIC: u32 = 0x2112_A442;

fn default_ipv4() -> Option<String> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    let ip = sock.local_addr().ok()?.ip().to_string();
    if ip == "0.0.0.0" {
        None
    } else {
        Some(ip)
    }
}

fn default_ipv6() -> Option<String> {
    let sock = UdpSocket::bind("[::]:0").ok()?;
    sock.connect("[2606:4700:4700::1111]:80").ok()?;
    let ip = sock.local_addr().ok()?.ip().to_string();
    // 只要全球单播；链路本地/回环对朋友没有意义
    if ip.contains(':') && !ip.starts_with("fe80") && !ip.starts_with("::1") {
        Some(ip)
    } else {
        None
    }
}

pub fn lan_address() -> String {
    default_ipv4().unwrap_or_else(|| "127.0.0.1".to_string())
}

fn interfaces_json() -> Json {
    let mut list = Vec::new();
    if let Some(ip) = default_ipv4() {
        list.push(Json::obj(vec![
            ("name", Json::s("默认路由")),
            ("address", Json::s(&ip)),
            ("family", Json::s("IPv4")),
            ("internal", Json::Bool(false)),
            ("virtual", Json::Bool(false)),
        ]));
    }
    if let Some(ip) = default_ipv6() {
        list.push(Json::obj(vec![
            ("name", Json::s("默认路由（IPv6）")),
            ("address", Json::s(&ip)),
            ("family", Json::s("IPv6")),
            ("internal", Json::Bool(false)),
            ("virtual", Json::Bool(false)),
        ]));
    }
    Json::Arr(list)
}

/* ---------------- 公网 IP ---------------- */

fn public_ip(flag: &str, url: &str) -> Option<String> {
    let out = curl(&["-s", "--max-time", "4", flag, url]).ok()?;
    let text = String::from_utf8_lossy(&out).trim().to_string();
    if flag == "-6" {
        if text.contains(':') {
            Some(text)
        } else {
            None
        }
    } else if text.contains(':') || text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/* ---------------- STUN ---------------- */

fn random_tx() -> [u8; 12] {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let pid = std::process::id() as u128;
    let mix = nanos ^ (pid << 64);
    let mut tx = [0u8; 12];
    for (i, b) in tx.iter_mut().enumerate() {
        *b = (mix >> ((i % 16) * 8)) as u8;
    }
    tx
}

/// 解析 Binding Success Response，优先 XOR-MAPPED-ADDRESS
pub fn parse_stun(buf: &[u8], _tx: &[u8; 12]) -> Option<(String, u16)> {
    if buf.len() < 20 || buf[0] != 0x01 || buf[1] != 0x01 {
        return None;
    }
    let len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
    let end = (20 + len).min(buf.len());
    let mut i = 20usize;
    while i + 4 <= end {
        let typ = u16::from_be_bytes([buf[i], buf[i + 1]]);
        let alen = u16::from_be_bytes([buf[i + 2], buf[i + 3]]) as usize;
        if i + 4 + alen > buf.len() {
            break;
        }
        let val = &buf[i + 4..i + 4 + alen];
        if typ == 0x0020 && alen >= 8 && val[1] == 0x01 {
            let port = u16::from_be_bytes([val[2], val[3]]) ^ (MAGIC >> 16) as u16;
            let mut ip = [0u8; 4];
            for k in 0..4 {
                ip[k] = val[4 + k] ^ ((MAGIC >> (24 - k * 8)) & 0xff) as u8;
            }
            return Some((format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]), port));
        }
        i += 4 + alen + ((4 - (alen % 4)) % 4);
    }
    None
}

fn stun_probe(host: &str, port: u16, timeout: Duration) -> Result<(String, u16), String> {
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("解析 {host} 失败：{e}"))?
        .find(|a| a.is_ipv4())
        .ok_or("STUN 地址解析结果为空（未获取到 IPv4 地址）")?;
    let sock = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("UDP 绑定失败：{e}"))?;
    sock.set_read_timeout(Some(timeout)).ok();

    let tx = random_tx();
    let mut req = [0u8; 20];
    req[0] = 0x00;
    req[1] = 0x01;
    req[4..8].copy_from_slice(&MAGIC.to_be_bytes());
    req[8..20].copy_from_slice(&tx);

    sock.send_to(&req, addr).map_err(|e| format!("STUN 发送失败：{e}"))?;
    let mut buf = [0u8; 1500];
    let (n, _) = sock.recv_from(&mut buf).map_err(|e| format!("STUN 超时：{e}"))?;
    parse_stun(&buf[..n], &tx).ok_or_else(|| "STUN 响应无法解析".to_string())
}

fn stun_json() -> Json {
    let a = stun_probe("stun.cloudflare.com", 3478, Duration::from_millis(1600));
    let b = stun_probe("stun.l.google.com", 19302, Duration::from_millis(1600));

    let mut servers = Vec::new();
    for (host, result) in [("stun.cloudflare.com", &a), ("stun.l.google.com", &b)] {
        match result {
            Ok((ip, port)) => servers.push(Json::obj(vec![
                ("host", Json::s(host)),
                ("ok", Json::Bool(true)),
                ("mapped", Json::s(&format!("{ip}:{port}"))),
                ("ip", Json::s(ip)),
                ("port", Json::n(*port as f64)),
            ])),
            Err(e) => servers.push(Json::obj(vec![
                ("host", Json::s(host)),
                ("ok", Json::Bool(false)),
                ("error", Json::s(e)),
            ])),
        }
    }

    let pair = match (&a, &b) {
        (Ok(x), Ok(y)) => Some((x, y)),
        _ => None,
    };
    let nat = match pair {
        Some((x, y)) if x == y => "cone",
        Some(_) => "symmetric",
        None => "unknown",
    };
    let first = a.as_ref().ok().or_else(|| b.as_ref().ok());

    Json::obj(vec![
        ("ok", Json::Bool(first.is_some())),
        (
            "mapped",
            first.map(|(ip, p)| Json::s(&format!("{ip}:{p}"))).unwrap_or(Json::Null),
        ),
        ("ip", first.map(|(ip, _)| Json::s(ip)).unwrap_or(Json::Null)),
        ("nat", Json::s(nat)),
        ("servers", Json::Arr(servers)),
        (
            "error",
            if first.is_some() {
                Json::Null
            } else {
                Json::s(a.as_ref().err().map(|s| s.as_str()).unwrap_or("STUN 不可用"))
            },
        ),
    ])
}

/* ---------------- UPnP ---------------- */

fn ssdp_location(timeout: Duration) -> Option<String> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.set_read_timeout(Some(Duration::from_millis(600))).ok();
    let msg = concat!(
        "M-SEARCH * HTTP/1.1\r\n",
        "HOST: 239.255.255.250:1900\r\n",
        "MAN: \"ssdp:discover\"\r\n",
        "MX: 2\r\n",
        "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n",
        "\r\n"
    );
    sock.send_to(msg.as_bytes(), "239.255.255.250:1900").ok()?;
    let start = Instant::now();
    let mut buf = [0u8; 4096];
    while start.elapsed() < timeout {
        let (n, _) = match sock.recv_from(&mut buf) {
            Ok(v) => v,
            Err(_) => break,
        };
        let text = String::from_utf8_lossy(&buf[..n]);
        for line in text.lines() {
            let trimmed = line.trim();
            if let Some((key, value)) = trimmed.split_once(':') {
                if key.eq_ignore_ascii_case("location") {
                    return Some(value.trim().to_string());
                }
            }
        }
    }
    None
}

fn http_text(url: &str) -> Option<String> {
    let out = curl(&["-s", "--max-time", "3", url]).ok()?;
    Some(String::from_utf8_lossy(&out).to_string())
}

fn tag(text: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close)? + start;
    Some(text[start..end].trim().to_string())
}

fn base_url(location: &str) -> Option<String> {
    let scheme = location.find("://")? + 3;
    let rest = &location[scheme..];
    let host_end = rest.find('/').unwrap_or(rest.len());
    Some(location[..scheme + host_end].to_string())
}

pub fn parse_service(xml: &str, location: &str) -> Option<(String, String)> {
    let mut ppp = None;
    for block in xml.split("<service>").skip(1) {
        let block = block.split("</service>").next().unwrap_or("");
        if !block.contains("WANIPConnection") && !block.contains("WANPPPConnection") {
            continue;
        }
        let service = tag(block, "serviceType")?;
        let control = tag(block, "controlURL")?;
        let url = if control.starts_with("http://") || control.starts_with("https://") {
            control
        } else {
            let base = base_url(location)?;
            format!("{}{}{}", base, if control.starts_with('/') { "" } else { "/" }, control)
        };
        let item = (service, url);
        // 优先 WANIPConnection：绝大多数家用路由的端口映射都挂在这个服务下
        if item.0.contains("WANIPConnection") {
            return Some(item);
        }
        if ppp.is_none() {
            ppp = Some(item);
        }
    }
    ppp
}

fn soap_envelope(service: &str, action: &str, params: &str) -> String {
    format!(
        "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:{action} xmlns:u=\"{service}\">{params}</u:{action}></s:Body></s:Envelope>"
    )
}

fn soap_call(control: &str, service: &str, action: &str, params: &str) -> Option<String> {
    let body = soap_envelope(service, action, params);
    let action_header = format!("SOAPAction: \"{service}#{action}\"");
    let out = curl(&[
        "-s",
        "--max-time",
        "3",
        "-X",
        "POST",
        "-H",
        "Content-Type: text/xml; charset=\"utf-8\"",
        "-H",
        &action_header,
        "--data-binary",
        &body,
        control,
    ])
    .ok()?;
    Some(String::from_utf8_lossy(&out).to_string())
}

fn fault_of(xml: &str) -> String {
    let code = tag(xml, "errorCode").unwrap_or_default();
    if code.is_empty() {
        return String::new();
    }
    let desc = tag(xml, "errorDescription").unwrap_or_default();
    format!("路由器拒绝（{code}{}）", if desc.is_empty() { String::new() } else { format!(" {desc}") })
}

fn discover_gateway() -> Result<(String, String, String), String> {
    let location = ssdp_location(Duration::from_millis(1800)).ok_or("路由器未响应 SSDP，可能未开启 UPnP")?;
    let xml = http_text(&location).unwrap_or_default();
    let (service, control) = parse_service(&xml, &location).ok_or("网关未提供 WANIPConnection 服务")?;
    Ok((location, service, control))
}

fn upnp_json() -> Json {
    let (location, service, control) = match discover_gateway() {
        Ok(v) => v,
        Err(e) => {
            return Json::obj(vec![("available", Json::Bool(false)), ("error", Json::s(&e))]);
        }
    };
    let external = soap_call(&control, &service, "GetExternalIPAddress", "")
        .and_then(|text| tag(&text, "NewExternalIPAddress"))
        .filter(|ip| ip != "0.0.0.0" && !ip.is_empty());
    let gateway = base_url(&location).unwrap_or(location);

    Json::obj(vec![
        ("available", Json::Bool(true)),
        ("gateway", Json::s(&gateway)),
        ("externalIp", external.map(|ip| Json::s(&ip)).unwrap_or(Json::Null)),
        ("serviceType", Json::s(&service)),
        ("controlURL", Json::s(&control)),
    ])
}

/// 在路由器上开一条 TCP 端口映射；只在用户显式点击时调用
pub fn upnp_map(port: u16) -> Json {
    let lan = lan_address();
    if lan == "127.0.0.1" {
        return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s("未找到可用的局域网 IPv4 地址"))]);
    }
    let (_, service, control) = match discover_gateway() {
        Ok(v) => v,
        Err(e) => return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s(&e))]),
    };
    let params = format!(
        "<NewRemoteHost></NewRemoteHost><NewExternalPort>{port}</NewExternalPort><NewProtocol>TCP</NewProtocol><NewInternalPort>{port}</NewInternalPort><NewInternalClient>{lan}</NewInternalClient><NewEnabled>1</NewEnabled><NewPortMappingDescription>Wulons MCSS</NewPortMappingDescription><NewLeaseDuration>0</NewLeaseDuration>"
    );
    let res = match soap_call(&control, &service, "AddPortMapping", &params) {
        Some(v) => v,
        None => return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s("路由器没有响应映射请求"))]),
    };
    if res.contains("<errorCode>") {
        let fault = fault_of(&res);
        return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s(&fault))]);
    }
    let external = soap_call(&control, &service, "GetExternalIPAddress", "")
        .and_then(|text| tag(&text, "NewExternalIPAddress"))
        .filter(|ip| ip != "0.0.0.0" && !ip.is_empty());
    Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("externalIp", external.map(|ip| Json::s(&ip)).unwrap_or(Json::Null)),
        ("externalPort", Json::n(port as f64)),
    ])
}

/// 撤销映射；只删 TCP，不碰路由器里的其它规则
pub fn upnp_unmap(port: u16) -> Json {
    let (_, service, control) = match discover_gateway() {
        Ok(v) => v,
        Err(e) => return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s(&e))]),
    };
    let params = format!(
        "<NewRemoteHost></NewRemoteHost><NewExternalPort>{port}</NewExternalPort><NewProtocol>TCP</NewProtocol>"
    );
    let res = match soap_call(&control, &service, "DeletePortMapping", &params) {
        Some(v) => v,
        None => return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s("路由器没有响应撤销请求"))]),
    };
    if res.contains("<errorCode>") {
        let fault = fault_of(&res);
        return Json::obj(vec![("ok", Json::Bool(false)), ("error", Json::s(&fault))]);
    }
    Json::obj(vec![("ok", Json::Bool(true))])
}

/* ---------------- 汇总 ---------------- */

pub fn doctor() -> Json {
    let v4 = public_ip("-4", "https://ipv4.icanhazip.com");
    let v6 = public_ip("-6", "https://ipv6.icanhazip.com");
    let stun = stun_json();
    let upnp = upnp_json();
    Json::obj(vec![
        ("at", Json::n(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0))),
        ("interfaces", interfaces_json()),
        ("publicV4", v4.map(|s| Json::s(&s)).unwrap_or(Json::Null)),
        ("publicV6", v6.map(|s| Json::s(&s)).unwrap_or(Json::Null)),
        ("stun", stun),
        ("upnp", upnp),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stun_xor_mapped_address() {
        let mut msg = vec![0x01, 0x01, 0x00, 0x0c, 0x21, 0x12, 0xa4, 0x42];
        msg.extend_from_slice(&[0u8; 12]);
        msg.extend_from_slice(&[0x00, 0x20, 0x00, 0x08, 0x00, 0x01]);
        let port: u16 = 25565 ^ 0x2112;
        msg.extend_from_slice(&port.to_be_bytes());
        let ip = [1u8, 2, 3, 4];
        for k in 0..4 {
            msg.push(ip[k] ^ ((MAGIC >> (24 - k * 8)) & 0xff) as u8);
        }
        let tx = [0u8; 12];
        assert_eq!(parse_stun(&msg, &tx), Some(("1.2.3.4".to_string(), 25565)));
    }

    #[test]
    fn service_url_is_resolved_against_gateway() {
        let xml = "<service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service>";
        let (service, url) = parse_service(xml, "http://192.168.1.1:5000/rootDesc.xml").unwrap();
        assert!(service.contains("WANIPConnection"));
        assert_eq!(url, "http://192.168.1.1:5000/ctl/IPConn");
    }

    #[test]
    fn tag_reads_external_ip() {
        let soap = "<NewExternalIPAddress>203.0.113.7</NewExternalIPAddress>";
        assert_eq!(tag(soap, "NewExternalIPAddress"), Some("203.0.113.7".to_string()));
    }

    #[test]
    fn soap_envelope_carries_service_and_params() {
        let body = soap_envelope(
            "urn:schemas-upnp-org:service:WANIPConnection:1",
            "AddPortMapping",
            "<NewExternalPort>25565</NewExternalPort>",
        );
        assert!(body.contains("AddPortMapping"));
        assert!(body.contains("WANIPConnection"));
        assert!(body.contains("<NewExternalPort>25565</NewExternalPort>"));
    }

    #[test]
    fn fault_is_human_readable() {
        let xml = "<errorCode>718</errorCode><errorDescription>ConflictInMappingEntry</errorDescription>";
        assert!(fault_of(xml).contains("718"));
        assert!(fault_of(xml).contains("ConflictInMappingEntry"));
    }
}
