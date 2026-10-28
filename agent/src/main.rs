//! Wulon's MCSS 本地助手（agent）
//! ------------------------------------------------------------
//! 目标：把 Electron 主进程的核心能力用最小的体积重新实现，让静态网页也能开服。
//! 设计：零第三方依赖（标准库自带 TCP + 进程 + 线程），单文件二进制约 3–5MB。
//!
//! 契约与 Electron preload 完全一致：POST /api/invoke {channel, args}
//! 事件走 SSE：/api/events，帧格式 {channel, payload}

mod http;
mod json;

use json::Json;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

struct State {
    config_path: PathBuf,
    config: Json,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    status: String,
    subscribers: Vec<TcpStream>,
    token: String,
}

type Shared = Arc<Mutex<State>>;

/* ------------------------------- 工具 ------------------------------- */

fn now_hms() -> String {
    // 东八区；agent 是本机工具，不做复杂时区处理
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        + 8 * 3600;
    let s = secs % 86_400;
    format!("{:02}:{:02}:{:02}", s / 3600, (s % 3600) / 60, s % 60)
}

fn default_config() -> Json {
    Json::obj(vec![
        ("version", Json::n(27.0)),
        ("theme", Json::s("dark")),
        ("accent", Json::s("#2f6feb")),
        ("instances", Json::Arr(vec![])),
        ("activeInstanceId", Json::Null),
        ("consoleViewMode", Json::s("code")),
        ("maxLogLines", Json::n(2000.0)),
        ("animationsEnabled", Json::Bool(true)),
        ("setupComplete", Json::Bool(true)),
        ("quickActions", Json::Arr(vec![])),
        ("frpProfiles", Json::Arr(vec![])),
        ("sync", Json::Null),
    ])
}

fn config_path() -> PathBuf {
    if let Ok(p) = std::env::var("MCSS_CONFIG") {
        return PathBuf::from(p);
    }
    let local = PathBuf::from("config.json");
    if local.exists() {
        return local;
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("wulons-mcss").join("config.json");
    }
    local
}

fn load_config(path: &Path) -> Json {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| Json::parse(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(default_config)
}

fn save_config(path: &Path, config: &Json) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, config.to_string());
}

fn local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

/* ------------------------------ 事件广播 ------------------------------ */

fn broadcast(state: &mut State, channel: &str, payload: Json) {
    let frame = Json::obj(vec![("channel", Json::s(channel)), ("payload", payload)]).to_string();
    state.subscribers.retain_mut(|s| http::sse_event(s, &frame));
}

fn emit_log(state: &mut State, level: &str, message: &str) {
    let payload = Json::obj(vec![
        ("timestamp", Json::s(&now_hms())),
        ("level", Json::s(level)),
        ("message", Json::s(message)),
    ]);
    broadcast(state, "server:output", payload);

    if message.contains("Done (") {
        state.status = "running".into();
        broadcast(state, "server:status", Json::s("running"));
    }
}

fn set_status(state: &mut State, status: &str) {
    state.status = status.to_string();
    broadcast(state, "server:status", Json::s(status));
}

/* ------------------------------- 服务器 ------------------------------- */

fn instance_by_id<'a>(config: &'a Json, id: &str) -> Option<&'a Json> {
    config
        .get("instances")
        .and_then(|v| v.arr())
        .and_then(|list| list.iter().find(|i| i.get("id").and_then(|v| v.str()) == Some(id)))
}

fn start_server(shared: &Shared, instance_id: &str) -> Result<Json, String> {
    let mut state = shared.lock().unwrap();
    if state.child.is_some() {
        return Err("服务器已在运行".into());
    }

    let instance = instance_by_id(&state.config, instance_id)
        .ok_or_else(|| format!("找不到实例 {instance_id}"))?
        .clone();

    let dir = instance.get("dir").and_then(|v| v.str()).unwrap_or("").to_string();
    if dir.is_empty() {
        return Err("实例还没有绑定目录".into());
    }
    let java = instance
        .get("javaPath")
        .and_then(|v| v.str())
        .filter(|s| !s.is_empty())
        .unwrap_or("java")
        .to_string();
    let mem_min = instance.get("memoryMin").and_then(|v| v.num()).unwrap_or(2.0);
    let mem_max = instance.get("memoryMax").and_then(|v| v.num()).unwrap_or(4.0);
    let jvm = instance.get("jvmArgs").and_then(|v| v.str()).unwrap_or("").to_string();

    let dir_path = PathBuf::from(&dir);
    if !dir_path.exists() {
        return Err(format!("目录不存在：{dir}"));
    }
    let jar = if dir_path.join("fabric-server-launch.jar").exists() {
        "fabric-server-launch.jar"
    } else if dir_path.join("server.jar").exists() {
        "server.jar"
    } else {
        return Err("目录里没有 fabric-server-launch.jar 或 server.jar".into());
    };

    let mut cmd = Command::new(&java);
    cmd.arg(format!("-Xms{mem_min}G"))
        .arg(format!("-Xmx{mem_max}G"));
    for part in jvm.split_whitespace() {
        cmd.arg(part);
    }
    cmd.arg("-jar").arg(jar).arg("nogui");
    cmd.current_dir(&dir_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("启动失败：{e}"))?;
    let pid = child.id();

    if let Some(stdout) = child.stdout.take() {
        let shared = Arc::clone(shared);
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().flatten() {
                let mut st = shared.lock().unwrap();
                emit_log(&mut st, "INFO", &line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let shared = Arc::clone(shared);
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().flatten() {
                let mut st = shared.lock().unwrap();
                emit_log(&mut st, "ERROR", &line);
            }
        });
    }

    state.child = Some(child);
    state.stdin = state.child.as_mut().and_then(|c| c.stdin.take());
    set_status(&mut state, "starting");

    Ok(Json::obj(vec![("ok", Json::Bool(true)), ("pid", Json::n(pid as f64))]))
}

fn stop_server(shared: &Shared) -> Json {
    let mut state = shared.lock().unwrap();
    if state.child.is_none() {
        return Json::obj(vec![("ok", Json::Bool(true))]);
    }
    if let Some(stdin) = state.stdin.as_mut() {
        let _ = stdin.write_all(b"stop\n");
        let _ = stdin.flush();
    }
    set_status(&mut state, "stopping");

    let shared2 = Arc::clone(shared);
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(12));
        let mut st = shared2.lock().unwrap();
        if let Some(mut child) = st.child.take() {
            let _ = child.kill();
            st.stdin = None;
            set_status(&mut st, "stopped");
            emit_log(&mut st, "WARN", "服务器 12 秒内没有退出，已强制结束");
        }
    });

    Json::obj(vec![("ok", Json::Bool(true))])
}

fn send_command(shared: &Shared, line: &str) -> Result<Json, String> {
    let mut state = shared.lock().unwrap();
    let stdin = state.stdin.as_mut().ok_or("服务器未运行")?;
    stdin
        .write_all(format!("{line}\n").as_bytes())
        .map_err(|e| format!("写入失败：{e}"))?;
    stdin.flush().map_err(|e| format!("写入失败：{e}"))?;
    let escaped = line.replace('\n', " ");
    emit_log(&mut state, "INFO", &format!("> {escaped}"));
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

/* ------------------------------- 文件 ------------------------------- */

fn fs_list(dir: &str) -> Result<Json, String> {
    let mut entries = Vec::new();
    let rd = std::fs::read_dir(dir).map_err(|e| format!("读取目录失败：{e}"))?;
    for entry in rd.flatten() {
        let path = entry.path();
        let meta = entry.metadata().ok();
        entries.push(Json::obj(vec![
            ("name", Json::s(&entry.file_name().to_string_lossy())),
            ("path", Json::s(&path.to_string_lossy())),
            ("isDir", Json::Bool(meta.as_ref().map(|m| m.is_dir()).unwrap_or(false))),
            ("size", Json::n(meta.as_ref().map(|m| m.len() as f64).unwrap_or(0.0))),
        ]));
    }
    Ok(Json::Arr(entries))
}

/* ------------------------------- 路由 ------------------------------- */

fn invoke(shared: &Shared, channel: &str, args: &[Json]) -> Result<Json, String> {
    let arg0 = args.first().and_then(|v| v.str()).unwrap_or("");
    match channel {
        "app:info" => Ok(Json::obj(vec![
            ("version", Json::s(env!("CARGO_PKG_VERSION"))),
            ("isPackaged", Json::Bool(false)),
            ("appData", Json::s(&std::env::var("APPDATA").unwrap_or_default())),
            ("userName", Json::s(&std::env::var("USERNAME").unwrap_or_default())),
            ("platform", Json::s("agent")),
            ("electron", Json::s("")),
            ("node", Json::s("")),
        ])),
        "app:lan-address" => Ok(Json::obj(vec![("ip", Json::s(&local_ip()))])),
        "config:read" => {
            let state = shared.lock().unwrap();
            Ok(state.config.clone())
        }
        "config:write" => {
            let patch = args.first().cloned().unwrap_or(Json::Obj(vec![]));
            let mut state = shared.lock().unwrap();
            let merged = merge(&state.config, &patch);
            state.config = merged.clone();
            save_config(&state.config_path, &merged);
            Ok(merged)
        }
        "fs:read" => std::fs::read_to_string(arg0)
            .map(Json::Str)
            .map_err(|e| format!("读取失败：{e}")),
        "fs:write" => {
            let content = args.get(1).and_then(|v| v.str()).unwrap_or("");
            if let Some(parent) = Path::new(arg0).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::write(arg0, content)
                .map(|_| Json::Null)
                .map_err(|e| format!("写入失败：{e}"))
        }
        "fs:exists" => Ok(Json::Bool(Path::new(arg0).exists())),
        "fs:list" => fs_list(arg0),
        "fs:mkdir" => std::fs::create_dir_all(arg0)
            .map(|_| Json::Null)
            .map_err(|e| format!("创建目录失败：{e}")),
        "server:start" => start_server(shared, arg0),
        "server:stop" => Ok(stop_server(shared)),
        "server:command" => send_command(shared, arg0),
        "server:status" => {
            let state = shared.lock().unwrap();
            Ok(Json::s(&state.status))
        }
        "server:pid" => {
            let state = shared.lock().unwrap();
            Ok(match state.child.as_ref() {
                Some(c) => Json::n(c.id() as f64),
                None => Json::Null,
            })
        }
        "server:memory" => Ok(Json::n(0.0)),
        other => Err(format!("agent 还没有实现 {other}")),
    }
}

fn merge(base: &Json, patch: &Json) -> Json {
    match (base, patch) {
        (Json::Obj(base_items), Json::Obj(patch_items)) => {
            let mut out = base_items.clone();
            for (k, v) in patch_items {
                if let Some(slot) = out.iter_mut().find(|(bk, _)| bk == k) {
                    slot.1 = v.clone();
                } else {
                    out.push((k.clone(), v.clone()));
                }
            }
            Json::Obj(out)
        }
        _ => patch.clone(),
    }
}

fn handle(shared: &Shared, mut stream: TcpStream) {
    let req = match http::read_request(&mut stream) {
        Some(r) => r,
        None => return,
    };

    if req.method == "OPTIONS" {
        http::preflight(&mut stream);
        return;
    }

    if req.path == "/api/health" {
        http::respond_json(&mut stream, 200, r#"{"ok":true}"#);
        return;
    }

    // token 校验（空 token = 只在本机开放，不校验）
    let expected = { shared.lock().unwrap().token.clone() };
    if !expected.is_empty() {
        let provided = if !req.token.is_empty() {
            req.token.clone()
        } else {
            req.param("token").unwrap_or("").to_string()
        };
        if provided != expected {
            http::respond_json(&mut stream, 401, r#"{"error":"配对令牌不对"}"#);
            return;
        }
    }

    if req.path == "/api/events" && req.method == "GET" {
        http::start_sse(&mut stream);
        if let Ok(clone) = stream.try_clone() {
            shared.lock().unwrap().subscribers.push(clone);
        }
        // 保持连接：读到断开为止
        let mut sink = [0u8; 64];
        use std::io::Read;
        loop {
            match stream.read(&mut sink) {
                Ok(0) => break,
                Ok(_) => {}
                Err(_) => break,
            }
        }
        return;
    }

    if req.path == "/api/invoke" && req.method == "POST" {
        let text = String::from_utf8_lossy(&req.body);
        let envelope = match Json::parse(&text) {
            Ok(v) => v,
            Err(e) => {
                http::respond_json(&mut stream, 400, &Json::obj(vec![("error", Json::s(&e))]).to_string());
                return;
            }
        };
        let channel = envelope.get("channel").and_then(|v| v.str()).unwrap_or("");
        let args = envelope
            .get("args")
            .and_then(|v| v.arr())
            .cloned()
            .unwrap_or_default();
        let body = match invoke(shared, channel, &args) {
            Ok(result) => Json::obj(vec![("result", result)]).to_string(),
            Err(err) => Json::obj(vec![("error", Json::s(&err))]).to_string(),
        };
        http::respond_json(&mut stream, 200, &body);
        return;
    }

    http::respond_json(&mut stream, 404, r#"{"error":"没有这个接口"}"#);
}

fn main() {
    let port: u16 = std::env::var("MCSS_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(28471);
    let token = std::env::var("MCSS_TOKEN").unwrap_or_default();
    let path = config_path();
    let config = load_config(&path);

    println!("mcss-agent {} 启动", env!("CARGO_PKG_VERSION"));
    println!("  配置: {}", path.display());
    println!("  监听: http://127.0.0.1:{port}");
    if token.is_empty() {
        println!("  令牌: （未设置，仅本机可用）");
    }

    let shared: Shared = Arc::new(Mutex::new(State {
        config_path: path,
        config,
        child: None,
        stdin: None,
        status: "stopped".into(),
        subscribers: Vec::new(),
        token,
    }));

    let listener = match TcpListener::bind(("127.0.0.1", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("端口 {port} 绑定失败：{e}");
            std::process::exit(1);
        }
    };

    for stream in listener.incoming().flatten() {
        let shared = Arc::clone(&shared);
        thread::spawn(move || handle(&shared, stream));
    }
}
