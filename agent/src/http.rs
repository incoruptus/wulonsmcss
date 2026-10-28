//! 极简 HTTP/1.1：只处理 agent 需要的请求形状（无第三方依赖）

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;

pub struct Request {
    pub method: String,
    pub path: String,
    pub query: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub token: String,
}

impl Request {
    pub fn param(&self, key: &str) -> Option<&str> {
        self.query.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }
}

fn parse_query(raw: &str) -> Vec<(String, String)> {
    raw.split('&')
        .filter(|s| !s.is_empty())
        .map(|pair| match pair.split_once('=') {
            Some((k, v)) => (k.to_string(), urldecode(v)),
            None => (pair.to_string(), String::new()),
        })
        .collect()
}

fn urldecode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    if reader.read_line(&mut line).ok()? == 0 {
        return None;
    }
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();
    let (path, raw_query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target, String::new()),
    };

    let mut content_length = 0usize;
    let mut token = String::new();
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 {
            break;
        }
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        if let Some((k, v)) = header.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let value = v.trim().to_string();
            if key == "content-length" {
                content_length = value.parse().unwrap_or(0);
            } else if key == "x-mcss-token" {
                token = value;
            }
        }
    }

    let mut body = vec![0u8; content_length.min(16 * 1024 * 1024)];
    if !body.is_empty() {
        reader.read_exact(&mut body).ok()?;
    }

    Some(Request {
        method,
        path,
        query: parse_query(&raw_query),
        body,
        token,
    })
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        405 => "Method Not Allowed",
        500 => "Internal Server Error",
        _ => "OK",
    }
}

fn cors_headers() -> String {
    [
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Headers: content-type, x-mcss-token",
        "Access-Control-Allow-Methods: GET, POST, OPTIONS",
        // Chrome 的 Private Network Access：公网页面访问 127.0.0.1 必须显式允许
        "Access-Control-Allow-Private-Network: true",
        "Cache-Control: no-store",
    ]
    .join("\r\n")
}

pub fn respond(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n{}\r\nConnection: close\r\n\r\n",
        status,
        reason(status),
        content_type,
        body.len(),
        cors_headers()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

pub fn respond_json(stream: &mut TcpStream, status: u16, body: &str) {
    respond(stream, status, "application/json; charset=utf-8", body.as_bytes());
}

pub fn preflight(stream: &mut TcpStream) {
    respond(stream, 204, "text/plain", b"");
}

/// 开一条 SSE 长连接（调用方自己 write 后续事件）
pub fn start_sse(stream: &mut TcpStream) {
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-store\r\n{}\r\nConnection: keep-alive\r\n\r\n",
        cors_headers()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.flush();
}

pub fn sse_event(stream: &mut TcpStream, payload: &str) -> bool {
    stream
        .write_all(format!("data: {}\n\n", payload).as_bytes())
        .and_then(|_| stream.flush())
        .is_ok()
}
