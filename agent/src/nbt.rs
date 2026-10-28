//! servers.dat 的最小 NBT 读写
//!
//! 结构固定为 `TAG_Compound("") { TAG_List("servers", TAG_Compound) [ {name, ip}, ... ] }`，
//! 所以只支持这一个子集，够用且不易出错。
//! 关键点：**必须能读**——写之前先读出来合并，否则会覆盖掉玩家已有的服务器列表。

#[derive(Clone, Debug, PartialEq)]
pub struct Server {
    pub name: String,
    pub ip: String,
}

fn read_string(buf: &[u8], off: usize) -> Option<(String, usize)> {
    if off + 2 > buf.len() {
        return None;
    }
    let len = u16::from_be_bytes([buf[off], buf[off + 1]]) as usize;
    let start = off + 2;
    let end = start.checked_add(len)?;
    if end > buf.len() {
        return None;
    }
    Some((String::from_utf8_lossy(&buf[start..end]).to_string(), end))
}

fn push_string(out: &mut Vec<u8>, text: &str) {
    let bytes = text.as_bytes();
    let len = (bytes.len().min(u16::MAX as usize)) as u16;
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(&bytes[..len as usize]);
}

/// 解析；遇到不认识的结构就返回已解析到的部分（不报错，避免写坏文件）
pub fn parse(buf: &[u8]) -> Vec<Server> {
    let mut out = Vec::new();
    if buf.len() < 3 || buf[0] != 0x0a {
        return out;
    }
    let mut off = 3; // root: type + 空名字
    while off < buf.len() {
        let tag = buf[off];
        if tag == 0x00 {
            break;
        }
        let Some((name, next)) = read_string(buf, off + 1) else { return out };
        off = next;
        if tag != 0x09 || name != "servers" {
            return out;
        }
        if off + 5 > buf.len() || buf[off] != 0x0a {
            return out;
        }
        let count = i32::from_be_bytes([buf[off + 1], buf[off + 2], buf[off + 3], buf[off + 4]]);
        off += 5;
        for _ in 0..count.max(0) {
            if off >= buf.len() || buf[off] != 0x0a {
                return out;
            }
            let Some((_, next)) = read_string(buf, off + 1) else { return out };
            off = next;
            let mut server = Server {
                name: String::new(),
                ip: String::new(),
            };
            while off < buf.len() && buf[off] != 0x00 {
                let t = buf[off];
                let Some((key, next)) = read_string(buf, off + 1) else { return out };
                off = next;
                if t == 0x08 {
                    let Some((value, next)) = read_string(buf, off) else { return out };
                    off = next;
                    match key.as_str() {
                        "name" => server.name = value,
                        "ip" => server.ip = value,
                        _ => {}
                    }
                } else {
                    return out;
                }
            }
            off += 1; // TAG_End
            out.push(server);
        }
        return out;
    }
    out
}

pub fn serialize(servers: &[Server]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[0x0a, 0x00, 0x00]);
    out.push(0x09);
    push_string(&mut out, "servers");
    out.push(0x0a);
    out.extend_from_slice(&(servers.len() as i32).to_be_bytes());
    for s in servers {
        out.extend_from_slice(&[0x0a, 0x00, 0x00]);
        out.push(0x08);
        push_string(&mut out, "name");
        push_string(&mut out, &s.name);
        out.push(0x08);
        push_string(&mut out, "ip");
        push_string(&mut out, &s.ip);
        out.push(0x00);
    }
    out.push(0x00);
    out
}

/// 同 ip 更新名字，否则追加
pub fn upsert(servers: &mut Vec<Server>, name: &str, ip: &str) {
    if let Some(existing) = servers.iter_mut().find(|s| s.ip == ip) {
        if !name.is_empty() {
            existing.name = name.to_string();
        }
    } else {
        servers.push(Server {
            name: if name.is_empty() { "Server".into() } else { name.into() },
            ip: ip.into(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;


    #[test]
    fn roundtrip_with_chinese() {
        let servers = vec![
            Server { name: "朋友的服".into(), ip: "frp.example.com:25565".into() },
            Server { name: "second".into(), ip: "1.2.3.4:25565".into() },
        ];
        let buf = serialize(&servers);
        assert_eq!(parse(&buf), servers);
    }

    #[test]
    fn upsert_updates_same_ip() {
        let mut servers = vec![Server { name: "旧名".into(), ip: "a:1".into() }];
        upsert(&mut servers, "新名", "a:1");
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "新名");
    }

    #[test]
    fn parse_rejects_garbage_without_panic() {
        assert!(parse(&[0xff, 0x00, 0x01]).is_empty());
        assert!(parse(&[0x0a, 0x00, 0x00, 0x08]).is_empty());
    }

    #[test]
    fn parses_real_client_file() {
        // 手动构造：root -> servers[1] -> {name, ip}
        let buf = serialize(&[Server { name: "x".into(), ip: "y:1".into() }]);
        let parsed = parse(&buf);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].ip, "y:1");
    }
}
