//! Wulon's MCSS 本地助手（agent）
//! ------------------------------------------------------------
//! 目标：把 Electron 主进程的核心能力用最小的体积重新实现，让静态网页也能开服。
//! 设计：零第三方依赖（标准库自带 TCP + 进程 + 线程），单文件二进制约 3–5MB。
//!
//! 契约与 Electron preload 完全一致：POST /api/invoke {channel, args}
//! 事件走 SSE：/api/events，帧格式 {channel, payload}

mod http;
mod json;
mod nbt;
mod sha1;

/// 版本号来自 package.json（由 build.rs 注入），保证三处一致
const PRODUCT_VERSION: &str = env!("MCSS_VERSION");

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
    /// frpc 隧道
    frp: Option<Child>,
    frp_logs: Vec<String>,
    frp_address: String,
    frp_error: String,
    frp_pending: bool,
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

/* --------------------------- 配对与深链 --------------------------- */

fn token_path() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("wulons-mcss").join("agent.token")
}

fn gen_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let mix = nanos.wrapping_mul(0x9E3779B97F4A7C15).wrapping_add(pid);
    format!("{:016x}{:016x}", (mix >> 64) as u64, mix as u64)
}

fn load_or_create_token() -> String {
    if let Ok(t) = std::env::var("MCSS_TOKEN") {
        if !t.is_empty() {
            return t;
        }
    }
    let path = token_path();
    if let Ok(text) = std::fs::read_to_string(&path) {
        let t = text.trim().to_string();
        if !t.is_empty() {
            return t;
        }
    }
    let token = gen_token();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, &token);
    token
}

/// 注册 mcss:// 协议（HKCU，当前用户，不需要管理员）
fn ensure_protocol() {
    #[cfg(windows)]
    {
        let exe = std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_default();
        let _ = Command::new("reg")
            .args(["add", r"HKCU\Software\Classes\mcss", "/ve", "/t", "REG_SZ", "/d", "URL:Wulon MCSS", "/f"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("reg")
            .args(["add", r"HKCU\Software\Classes\mcss", "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Classes\mcss\shell\open\command",
                "/ve",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{exe}\" --join \"%1\""),
                "/f",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// 被 mcss:// 唤起时：把房间码转成网页链接并打开
///   mcss://join/<code>      → 打开房间页
///   mcss://install/<code>   → 打开并自动开始准备（少点一次）
fn handle_join(arg: &str, token: &str) {
    let parts: Vec<&str> = arg.trim_end_matches('/').split('/').collect();
    let code = parts.last().unwrap_or(&"").to_string();
    let auto = parts.iter().any(|p| p.contains(":install")) || arg.contains("//install");
    if code.is_empty() {
        eprintln!("深链里没有房间码：{arg}");
        return;
    }
    let base = std::env::var("MCSS_WEB_BASE").unwrap_or_else(|_| "https://wulons.github.io/mcss".into());
    let url = if auto {
        format!("{base}/#/join/{code}?auto=1&t={token}")
    } else {
        format!("{base}/#/join/{code}?t={token}")
    };
    println!("打开：{url}");
    if std::env::var("MCSS_NO_OPEN").is_err() {
        #[cfg(windows)]
        let _ = Command::new("cmd").args(["/c", "start", "", &url]).status();
    }
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

/* ------------------------------- 客户端 ------------------------------- */

const UA: &str = "WulonsMCSS/27.0 (github.com/wulons)";

/// 调系统 curl（Windows 10+ 自带）。用 curl 而不是手写 TLS：更稳、更省事。
fn curl(args: &[&str]) -> Result<Vec<u8>, String> {
    let out = Command::new("curl")
        .args(args)
        .output()
        .map_err(|e| format!("调用 curl 失败：{e}"))?;
    if !out.status.success() {
        return Err(format!(
            "下载失败（curl {}）：{}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(out.stdout)
}

fn emit_progress(shared: &Shared, stage: &str, percent: i32, detail: &str) {
    let mut state = shared.lock().unwrap();
    broadcast(
        &mut state,
        "client:progress",
        Json::obj(vec![
            ("stage", Json::s(stage)),
            ("percent", Json::n(percent as f64)),
            ("detail", Json::s(detail)),
        ]),
    );
}

fn add_server(opts: &Json) -> Result<Json, String> {
    let mc_dir = opts.get("mcDir").and_then(|v| v.str()).unwrap_or("");
    let name = opts.get("name").and_then(|v| v.str()).unwrap_or("");
    let ip = opts.get("ip").and_then(|v| v.str()).unwrap_or("");
    if mc_dir.is_empty() || ip.is_empty() {
        return Err("缺少客户端目录或服务器地址".into());
    }

    let dir = Path::new(mc_dir);
    let file = dir.join("servers.dat");
    // 先读后写：绝不能覆盖玩家已有的服务器列表
    let mut servers = std::fs::read(&file).map(|b| nbt::parse(&b)).unwrap_or_default();
    nbt::upsert(&mut servers, name, ip);
    std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{e}"))?;
    std::fs::write(&file, nbt::serialize(&servers)).map_err(|e| format!("写入失败：{e}"))?;

    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("file", Json::s(&file.to_string_lossy())),
        ("count", Json::n(servers.len() as f64)),
    ]))
}

/* ------------------------------- 依赖解析 ------------------------------- */

/// 取某个 Modrinth 版本的首选文件信息
fn resolve_version_file(version_id: &str) -> Result<Json, String> {
    let api = format!("https://api.modrinth.com/v2/version/{version_id}");
    let body = curl(&["-s", "--max-time", "20", "-H", &format!("User-Agent: {UA}"), &api])?;
    let text = String::from_utf8_lossy(&body).to_string();
    let json = Json::parse(&text).map_err(|e| format!("解析版本信息失败：{e}"))?;
    let files = json.get("files").and_then(|v| v.arr()).ok_or("这个版本没有文件")?;
    let file = files
        .iter()
        .find(|f| f.get("primary").and_then(|v| v.bool()) == Some(true))
        .or_else(|| files.first())
        .ok_or("这个版本没有文件")?
        .clone();
    Ok(file)
}

/// 导出 .mrpack（PCL2 / HMCL / Prism / Modrinth App 都能导入）
fn export_mrpack(shared: &Shared, opts: &Json) -> Result<Json, String> {
    let out_file = opts.get("outFile").and_then(|v| v.str()).unwrap_or("").to_string();
    if out_file.is_empty() {
        return Err("缺少导出路径".into());
    }
    let room = opts.get("room").ok_or("缺少房间信息")?;
    let mc = room.get("mc").and_then(|v| v.str()).unwrap_or("").to_string();
    if mc.is_empty() {
        return Err("房间信息不完整".into());
    }
    let loader = room.get("loader").and_then(|v| v.str()).unwrap_or("vanilla").to_string();
    let lv = room.get("lv").and_then(|v| v.str()).unwrap_or("").to_string();
    let addr = room.get("addr").and_then(|v| v.str()).unwrap_or("").to_string();
    let name = room
        .get("name")
        .and_then(|v| v.str())
        .unwrap_or("Wulon's MCSS 房间")
        .to_string();
    let mods = room.get("mods").and_then(|v| v.arr()).cloned().unwrap_or_default();

    let stage = std::env::temp_dir().join(format!("mcss-mrpack-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&stage);
    std::fs::create_dir_all(&stage).map_err(|e| format!("创建临时目录失败：{e}"))?;

    let cleanup = |stage: &Path| {
        let _ = std::fs::remove_dir_all(stage);
    };

    let mut files = Vec::new();
    for (i, m) in mods.iter().enumerate() {
        let version_id = m.get("v").and_then(|v| v.str()).unwrap_or("");
        emit_progress(shared, "解析 Mod", ((i * 70) / mods.len().max(1)) as i32, &format!("{}/{}", i + 1, mods.len()));
        match resolve_version_file(version_id) {
            Ok(file) => {
                let filename = file.get("filename").and_then(|v| v.str()).unwrap_or("mod.jar");
                let url = file.get("url").and_then(|v| v.str()).unwrap_or("");
                let hashes = file.get("hashes");
                files.push(Json::obj(vec![
                    ("path", Json::s(&format!("mods/{filename}"))),
                    (
                        "hashes",
                        Json::obj(vec![
                            ("sha1", Json::s(hashes.and_then(|h| h.get("sha1")).and_then(|v| v.str()).unwrap_or(""))),
                            ("sha512", Json::s(hashes.and_then(|h| h.get("sha512")).and_then(|v| v.str()).unwrap_or(""))),
                        ]),
                    ),
                    ("downloads", Json::Arr(vec![Json::s(url)])),
                    ("fileSize", Json::n(file.get("size").and_then(|v| v.num()).unwrap_or(0.0))),
                ]));
            }
            Err(e) => {
                cleanup(&stage);
                return Err(format!("解析 Mod 失败：{e}"));
            }
        }
    }

    let mut deps = vec![("minecraft", Json::s(&mc))];
    if loader == "fabric" && !lv.is_empty() {
        deps.push(("fabric-loader", Json::s(&lv)));
    }

    let index = Json::obj(vec![
        ("formatVersion", Json::n(1.0)),
        ("game", Json::s("minecraft")),
        ("versionId", Json::s(&format!("mcss-{}", std::process::id()))),
        ("name", Json::s(&name)),
        ("summary", Json::s(&format!("{mc} · {loader}"))),
        ("files", Json::Arr(files)),
        ("dependencies", Json::Obj(deps.into_iter().map(|(k, v)| (k.to_string(), v)).collect())),
    ]);

    std::fs::write(stage.join("modrinth.index.json"), index.to_string()).map_err(|e| format!("写入清单失败：{e}"))?;

    let mut entries = vec!["modrinth.index.json".to_string()];
    if !addr.is_empty() {
        let overrides = stage.join("overrides");
        std::fs::create_dir_all(&overrides).map_err(|e| format!("创建 overrides 失败：{e}"))?;
        let servers = vec![nbt::Server {
            name: name.clone(),
            ip: addr.clone(),
        }];
        std::fs::write(overrides.join("servers.dat"), nbt::serialize(&servers)).map_err(|e| format!("写入服务器列表失败：{e}"))?;
        entries.push("overrides".to_string());
    }

    if let Some(parent) = Path::new(&out_file).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut args: Vec<String> = vec!["-a".into(), "-c".into(), "-f".into(), out_file.clone()];
    args.extend(entries);
    let status = Command::new("tar")
        .args(&args)
        .current_dir(&stage)
        .status()
        .map_err(|e| format!("打包失败：{e}"))?;
    cleanup(&stage);
    if !status.success() {
        return Err("打包失败（tar 退出码非 0）".into());
    }

    let size = std::fs::metadata(&out_file).map(|m| m.len()).unwrap_or(0);
    emit_progress(shared, "完成", 100, "");
    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("file", Json::s(&out_file)),
        ("size", Json::n(size as f64)),
        ("mods", Json::n(mods.len() as f64)),
    ]))
}

/// 给本地 Mod 反查 Modrinth 版本：先按 fabric id 当 slug，再按名字搜索，
/// 都要求「文件名完全一致」才算命中（宁可漏，不可错）。
fn resolve_one(item: &Json) -> Option<Json> {
    let id = item.get("id").and_then(|v| v.str()).unwrap_or("");
    let file = item.get("file").and_then(|v| v.str()).unwrap_or("");
    let version = item.get("version").and_then(|v| v.str()).unwrap_or("");
    let name = item.get("name").and_then(|v| v.str()).unwrap_or("");
    if file.is_empty() {
        return None;
    }

    let mut projects: Vec<(String, String)> = Vec::new();
    if !id.is_empty() {
        if let Ok(p) = get_json(&format!("https://api.modrinth.com/v2/project/{}", urlencode(id))) {
            if let Some(pid) = p.get("id").and_then(|v| v.str()) {
                let title = p.get("title").and_then(|v| v.str()).unwrap_or("").to_string();
                projects.push((pid.to_string(), title));
            }
        }
    }

    if projects.is_empty() && !name.is_empty() {
        if let Ok(res) = modrinth_search(name, None) {
            if let Some(hits) = res.get("hits").and_then(|v| v.arr()) {
                for hit in hits.iter().take(3) {
                    if let (Some(pid), Some(title)) = (
                        hit.get("id").and_then(|v| v.str()),
                        hit.get("title").and_then(|v| v.str()),
                    ) {
                        projects.push((pid.to_string(), title.to_string()));
                    }
                }
            }
        }
    }

    for (pid, title) in projects {
        let Ok(list) = get_json(&format!("https://api.modrinth.com/v2/project/{pid}/version")) else {
            continue;
        };
        let Some(versions) = list.arr() else { continue };

        let matches_file = |v: &Json| {
            v.get("files")
                .and_then(|f| f.arr())
                .map(|files| {
                    files
                        .iter()
                        .any(|f| f.get("filename").and_then(|x| x.str()) == Some(file))
                })
                .unwrap_or(false)
        };

        if let Some(hit) = versions.iter().find(|v| matches_file(v)) {
            if let Some(vid) = hit.get("id").and_then(|v| v.str()) {
                return Some(Json::obj(vec![
                    ("file", Json::s(file)),
                    ("p", Json::s(&pid)),
                    ("v", Json::s(vid)),
                    ("n", Json::s(&title)),
                    ("matched", Json::s("file")),
                ]));
            }
        }
        if !version.is_empty() {
            let hit = versions
                .iter()
                .find(|v| v.get("version_number").and_then(|x| x.str()) == Some(version));
            if let Some(hit) = hit {
                if let Some(vid) = hit.get("id").and_then(|v| v.str()) {
                    return Some(Json::obj(vec![
                        ("file", Json::s(file)),
                        ("p", Json::s(&pid)),
                        ("v", Json::s(vid)),
                        ("n", Json::s(&title)),
                        ("matched", Json::s("version")),
                    ]));
                }
            }
        }
    }
    None
}

fn resolve_modrinth(list: &[Json]) -> Vec<Json> {
    list.iter().filter_map(resolve_one).collect()
}

fn prepare_client(shared: &Shared, opts: &Json) -> Result<Json, String> {    let dir = opts.get("dir").and_then(|v| v.str()).unwrap_or("").to_string();
    if dir.is_empty() {
        return Err("缺少目标目录".into());
    }
    let mods = opts
        .get("mods")
        .and_then(|v| v.arr())
        .cloned()
        .unwrap_or_default();
    let mods_dir = Path::new(&dir).join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| format!("创建 mods 目录失败：{e}"))?;

    let total = mods.len();
    let mut results = Vec::new();

    for (i, m) in mods.iter().enumerate() {
        let version_id = m.get("v").and_then(|v| v.str()).unwrap_or("").to_string();
        let label = m
            .get("n")
            .and_then(|v| v.str())
            .or_else(|| m.get("p").and_then(|v| v.str()))
            .unwrap_or(&version_id)
            .to_string();

        emit_progress(shared, &format!("准备 {label}"), ((i * 100) / total.max(1)) as i32, &format!("{}/{}", i + 1, total));

        let result = (|| -> Result<Json, String> {
            let file = resolve_version_file(&version_id)?;
            let filename = file.get("filename").and_then(|v| v.str()).unwrap_or("mod.jar").to_string();
            let url = file.get("url").and_then(|v| v.str()).ok_or("缺少下载地址")?;
            let dest = mods_dir.join(&filename);

            if let Ok(meta) = std::fs::metadata(&dest) {
                let expected = file.get("size").and_then(|v| v.num()).unwrap_or(-1.0);
                if expected >= 0.0 && meta.len() as f64 == expected {
                    return Ok(Json::obj(vec![
                        ("ok", Json::Bool(true)),
                        ("name", Json::s(&label)),
                        ("file", Json::s(&filename)),
                        ("skipped", Json::Bool(true)),
                    ]));
                }
            }

            curl(&[
                "-L",
                "--fail",
                "--max-time",
                "600",
                "-H",
                &format!("User-Agent: {UA}"),
                "-o",
                &dest.to_string_lossy(),
                url,
            ])?;

            Ok(Json::obj(vec![
                ("ok", Json::Bool(true)),
                ("name", Json::s(&label)),
                ("file", Json::s(&filename)),
            ]))
        })();

        results.push(match result {
            Ok(v) => v,
            Err(e) => Json::obj(vec![("ok", Json::Bool(false)), ("name", Json::s(&label)), ("error", Json::s(&e))]),
        });
    }

    emit_progress(shared, "完成", 100, &format!("{total} 个 Mod"));

    let ok = results.iter().all(|r| r.get("ok").and_then(|v| v.bool()) == Some(true));
    Ok(Json::obj(vec![
        ("ok", Json::Bool(ok)),
        ("dir", Json::s(&dir)),
        ("modsDir", Json::s(&mods_dir.to_string_lossy())),
        ("results", Json::Arr(results)),
    ]))
}

/* ------------------------------- 备份 ------------------------------- */

fn backup_dir(server_dir: &str) -> PathBuf {
    Path::new(server_dir).join("backups")
}

/// 东八区的 YYYYMMDD-HHMMSS（不引时区库，用民用历算法自己算）
fn now_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        + 8 * 3600;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Howard Hinnant 的 civil_from_days
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn mtime_ms(path: &Path) -> f64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn backup_list(server_dir: &str) -> Result<Json, String> {
    let dir = backup_dir(server_dir);
    let mut items: Vec<(f64, Json)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("zip") {
                continue;
            }
            let at = mtime_ms(&path);
            items.push((
                at,
                Json::obj(vec![
                    ("name", Json::s(&entry.file_name().to_string_lossy())),
                    ("path", Json::s(&path.to_string_lossy())),
                    ("size", Json::n(std::fs::metadata(&path).map(|m| m.len() as f64).unwrap_or(0.0))),
                    ("mtime", Json::n(at)),
                ]),
            ));
        }
    }
    items.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Ok(Json::Arr(items.into_iter().map(|(_, v)| v).collect()))
}

fn backup_create(server_dir: &str) -> Result<Json, String> {
    let world = Path::new(server_dir).join("world");
    if !world.exists() {
        return Err("还没有 world 目录，先启动一次服务器".into());
    }
    let dir = backup_dir(server_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败：{e}"))?;
    let name = format!("world-{}.zip", now_stamp());
    let out = dir.join(&name);

    let status = Command::new("tar")
        .args(["-a", "-c", "-f"])
        .arg(&out)
        .arg("world")
        .current_dir(server_dir)
        .status()
        .map_err(|e| format!("打包失败：{e}"))?;

    if !status.success() {
        let _ = std::fs::remove_file(&out);
        return Err("打包失败（tar 退出码非 0）".into());
    }
    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("name", Json::s(&name)),
        ("size", Json::n(std::fs::metadata(&out).map(|m| m.len() as f64).unwrap_or(0.0))),
    ]))
}

fn backup_remove(server_dir: &str, name: &str) -> Result<Json, String> {
    if name.contains(['/', '\\']) || !name.ends_with(".zip") {
        return Err("文件名不合法".into());
    }
    std::fs::remove_file(backup_dir(server_dir).join(name)).map_err(|e| format!("删除失败：{e}"))?;
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

/// 恢复：先把现有 world 改名留底，解压失败自动回滚
fn backup_restore(shared: &Shared, server_dir: &str, name: &str) -> Result<Json, String> {
    {
        let state = shared.lock().unwrap();
        if state.status != "stopped" {
            return Err("先把服务器停掉再恢复，否则会写坏存档".into());
        }
    }
    if name.contains(['/', '\\']) || !name.ends_with(".zip") {
        return Err("文件名不合法".into());
    }
    let file = backup_dir(server_dir).join(name);
    if !file.exists() {
        return Err("备份文件不存在".into());
    }

    let world = Path::new(server_dir).join("world");
    let parked = Path::new(server_dir).join(format!("world.before-restore-{}", now_stamp()));
    if world.exists() {
        std::fs::rename(&world, &parked).map_err(|e| format!("移走旧存档失败：{e}"))?;
    }

    let status = Command::new("tar")
        .args(["-x", "-f"])
        .arg(&file)
        .current_dir(server_dir)
        .status();

    match status {
        Ok(s) if s.success() => Ok(Json::obj(vec![
            ("ok", Json::Bool(true)),
            ("parked", Json::s(&parked.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())),
        ])),
        _ => {
            // 回滚
            let _ = std::fs::remove_dir_all(&world);
            let _ = std::fs::rename(&parked, &world);
            Err("恢复失败，已还原原来的存档".into())
        }
    }
}

/* ----------------------------- AI 现场包 ----------------------------- */

/// 知识库在编译期嵌进二进制：agent 单文件分发，不依赖外部 docs 目录
const KNOWLEDGE_MD: &str = include_str!("../../docs/ai/knowledge.md");
const AI_README: &str = include_str!("../../docs/ai/README.md");

fn is_secret_key(key: &str) -> bool {
    let k = key.to_ascii_lowercase();
    ["token", "password", "secret", "gistid", "paircode", "apikey"]
        .iter()
        .any(|s| k.contains(s))
}

/// 令牌换掉、结构保留
fn sanitize(value: &Json) -> Json {
    match value {
        Json::Obj(items) => Json::Obj(
            items
                .iter()
                .map(|(k, v)| {
                    if is_secret_key(k) {
                        (k.clone(), Json::s(if matches!(v, Json::Null) { "" } else { "*** REDACTED ***" }))
                    } else {
                        (k.clone(), sanitize(v))
                    }
                })
                .collect(),
        ),
        Json::Arr(items) => Json::Arr(items.iter().map(sanitize).collect()),
        other => other.clone(),
    }
}

fn redact_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut redact_next = false;
    for token in text.split_whitespace() {
        if redact_next {
            out.push_str("***REDACTED***");
            redact_next = false;
        } else if token == "Bearer" || token == "bearer" {
            out.push_str(token);
            redact_next = true;
        } else if token.contains("ghp_") || token.contains("github_pat_") {
            out.push_str("***REDACTED***");
        } else {
            out.push_str(token);
        }
        out.push(' ');
    }
    out
}

fn export_bundle(shared: &Shared, opts: &Json) -> Result<Json, String> {
    let out_file = opts.get("outFile").and_then(|v| v.str()).unwrap_or("").to_string();
    if out_file.is_empty() {
        return Err("缺少导出路径".into());
    }
    let instance_id = opts.get("instanceId").and_then(|v| v.str()).unwrap_or("");
    let symptom = opts.get("symptom");
    let logs: Vec<String> = opts
        .get("logs")
        .and_then(|v| v.arr())
        .map(|arr| arr.iter().filter_map(|v| v.str().map(String::from)).collect())
        .unwrap_or_default();

    let (config, instance) = {
        let state = shared.lock().unwrap();
        let inst = instance_by_id(&state.config, instance_id).cloned();
        (state.config.clone(), inst)
    };
    let instance = instance.ok_or("实例不存在")?;

    let stage = std::env::temp_dir().join(format!("mcss-aidiag-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&stage);
    std::fs::create_dir_all(stage.join("logs")).map_err(|e| format!("创建临时目录失败：{e}"))?;

    let readme = format!(
        "# Wulon's MCSS 排错现场包\n\n生成时间：{}\n实例：{} · Minecraft {} · {}\n\n\
         ## 文件\n- `context.md`：实例信息与症状，**先读这个**\n- `logs/recent.log`：最近的控制台输出（已脱敏）\n\
         - `config.sanitized.json`：配置（令牌已替换）\n- `knowledge.md`：症状→原因→修法对照表\n\n\
         ## 希望你（AI）怎么做\n1. 先复述症状与证据；\n2. 对照知识库判断原因；\n\
         3. 给不超过 3 个可逆步骤；\n4. 证据不足就说还需要哪段日志。\n",
        now_stamp(),
        instance.get("name").and_then(|v| v.str()).unwrap_or("?"),
        instance.get("mcVersion").and_then(|v| v.str()).unwrap_or("?"),
        instance.get("loader").and_then(|v| v.str()).unwrap_or("?"),
    );

    let mut context = String::new();
    context.push_str("# 现场\n\n## 实例\n");
    for (label, key) in [
        ("名称", "name"),
        ("版本", "mcVersion"),
        ("加载器", "loader"),
        ("目录", "dir"),
        ("Java", "javaPath"),
    ] {
        context.push_str(&format!(
            "- {label}：{}\n",
            instance.get(key).and_then(|v| v.str()).unwrap_or("?")
        ));
    }
    context.push_str(&format!(
        "- 端口：{}\n",
        instance.get("port").and_then(|v| v.num()).unwrap_or(0.0)
    ));
    if let Some(s) = symptom {
        context.push_str("\n## 用户描述的症状\n");
        context.push_str(s.get("title").and_then(|v| v.str()).unwrap_or(""));
        context.push('\n');
        if let Some(d) = s.get("detail").and_then(|v| v.str()) {
            context.push_str(d);
            context.push('\n');
        }
    }
    context.push_str(&format!("\n日志共 {} 行，见 logs/recent.log。\n", logs.len()));

    let tail: Vec<String> = logs.iter().rev().take(500).rev().map(|l| redact_text(l)).collect();

    std::fs::write(stage.join("README.md"), readme).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::write(stage.join("context.md"), context).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::write(stage.join("knowledge.md"), KNOWLEDGE_MD).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::write(stage.join("logs").join("recent.log"), tail.join("\n")).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::write(
        stage.join("config.sanitized.json"),
        sanitize(&config).to_string(),
    )
    .map_err(|e| format!("写入失败：{e}"))?;

    if let Some(parent) = Path::new(&out_file).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let status = Command::new("tar")
        .args(["-a", "-c", "-f"])
        .arg(&out_file)
        .args(["README.md", "context.md", "knowledge.md", "config.sanitized.json", "logs"])
        .current_dir(&stage)
        .status()
        .map_err(|e| format!("打包失败：{e}"))?;
    let _ = std::fs::remove_dir_all(&stage);
    if !status.success() {
        return Err("打包失败（tar 退出码非 0）".into());
    }

    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("file", Json::s(&out_file)),
        ("size", Json::n(std::fs::metadata(&out_file).map(|m| m.len() as f64).unwrap_or(0.0))),
        ("logs", Json::n(tail.len() as f64)),
    ]))
}

/* ------------------------------ Modrinth ------------------------------ */

fn urlencode(text: &str) -> String {
    let mut out = String::new();
    for b in text.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn get_json(url: &str) -> Result<Json, String> {
    let body = curl(&["-s", "--max-time", "20", "-H", &format!("User-Agent: {UA}"), url])?;
    let text = String::from_utf8_lossy(&body).to_string();
    Json::parse(&text).map_err(|e| format!("解析接口返回失败：{e}"))
}

fn modrinth_search(query: &str, opts: Option<&Json>) -> Result<Json, String> {
    let limit = opts.and_then(|o| o.get("limit")).and_then(|v| v.num()).unwrap_or(20.0) as i32;
    let offset = opts.and_then(|o| o.get("offset")).and_then(|v| v.num()).unwrap_or(0.0) as i32;
    let mc = opts.and_then(|o| o.get("mcVersion")).and_then(|v| v.str());
    let loader = opts.and_then(|o| o.get("loader")).and_then(|v| v.str());

    let mut facets = vec![r#"["project_type:mod"]"#.to_string()];
    if let Some(mc) = mc {
        facets.push(format!(r#"["versions:{mc}"]"#));
    }
    if let Some(loader) = loader {
        facets.push(format!(r#"["categories:{loader}"]"#));
    }
    let facets_json = format!("[{}]", facets.join(","));

    let url = format!(
        "https://api.modrinth.com/v2/search?query={}&limit={limit}&offset={offset}&facets={}",
        urlencode(query),
        urlencode(&facets_json)
    );
    let json = get_json(&url)?;

    let mut hits = Vec::new();
    if let Some(list) = json.get("hits").and_then(|v| v.arr()) {
        for hit in list {
            let str_of = |k: &str| hit.get(k).and_then(|v| v.str()).unwrap_or("").to_string();
            let categories = hit
                .get("categories")
                .and_then(|v| v.arr())
                .map(|arr| arr.iter().filter_map(|c| c.str().map(Json::s)).collect())
                .unwrap_or_default();
            hits.push(Json::obj(vec![
                ("id", Json::s(&str_of("project_id"))),
                ("slug", Json::s(&str_of("slug"))),
                ("title", Json::s(&str_of("title"))),
                ("description", Json::s(&str_of("description"))),
                ("iconUrl", Json::s(&str_of("icon_url"))),
                ("downloads", Json::n(hit.get("downloads").and_then(|v| v.num()).unwrap_or(0.0))),
                ("author", Json::s(&str_of("author"))),
                ("categories", Json::Arr(categories)),
            ]));
        }
    }

    Ok(Json::obj(vec![
        ("hits", Json::Arr(hits)),
        ("total", Json::n(json.get("total_hits").and_then(|v| v.num()).unwrap_or(0.0))),
    ]))
}

fn modrinth_versions(project_id: &str, opts: Option<&Json>) -> Result<Json, String> {
    let mc = opts.and_then(|o| o.get("mcVersion")).and_then(|v| v.str());
    let loader = opts.and_then(|o| o.get("loader")).and_then(|v| v.str());

    let mut url = format!("https://api.modrinth.com/v2/project/{}/version?", urlencode(project_id));
    if let Some(mc) = mc {
        url.push_str(&format!("game_versions={}&", urlencode(&format!(r#"["{mc}"]"#))));
    }
    if let Some(loader) = loader {
        url.push_str(&format!("loaders={}&", urlencode(&format!(r#"["{loader}"]"#))));
    }

    let json = get_json(&url)?;
    let list = json.arr().ok_or("接口返回格式不对")?;

    let mut out = Vec::new();
    for v in list {
        let str_of = |k: &str| v.get(k).and_then(|x| x.str()).unwrap_or("").to_string();
        let strs = |k: &str| {
            v.get(k)
                .and_then(|x| x.arr())
                .map(|arr| arr.iter().filter_map(|s| s.str().map(Json::s)).collect::<Vec<_>>())
                .unwrap_or_default()
        };
        let files = v
            .get("files")
            .and_then(|f| f.arr())
            .map(|arr| {
                arr.iter()
                    .map(|f| {
                        Json::obj(vec![
                            ("url", Json::s(f.get("url").and_then(|x| x.str()).unwrap_or(""))),
                            ("filename", Json::s(f.get("filename").and_then(|x| x.str()).unwrap_or(""))),
                            ("size", Json::n(f.get("size").and_then(|x| x.num()).unwrap_or(0.0))),
                            ("primary", Json::Bool(f.get("primary").and_then(|x| x.bool()).unwrap_or(false))),
                        ])
                    })
                    .collect()
            })
            .unwrap_or_default();

        out.push(Json::obj(vec![
            ("id", Json::s(&str_of("id"))),
            ("name", Json::s(&str_of("name"))),
            ("versionNumber", Json::s(&str_of("version_number"))),
            ("gameVersions", Json::Arr(strs("game_versions"))),
            ("loaders", Json::Arr(strs("loaders"))),
            ("datePublished", Json::s(&str_of("date_published"))),
            ("files", Json::Arr(files)),
        ]));
    }
    Ok(Json::Arr(out))
}

fn modrinth_install(opts: &Json) -> Result<Json, String> {
    let dir = opts.get("dir").and_then(|v| v.str()).unwrap_or("");
    let url = opts.get("fileUrl").and_then(|v| v.str()).unwrap_or("");
    let filename = opts.get("fileName").and_then(|v| v.str()).unwrap_or("mod.jar");
    if dir.is_empty() || !url.starts_with("https://") {
        return Err("缺少安装目录或下载地址不合法".into());
    }
    let safe: String = filename
        .chars()
        .map(|c| if r#"[\\/:*?"<>|]"#.contains(c) { '_' } else { c })
        .collect();
    let dest = Path::new(dir).join("mods").join(&safe);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    curl(&[
        "-L",
        "--fail",
        "--max-time",
        "600",
        "-H",
        &format!("User-Agent: {UA}"),
        "-o",
        &dest.to_string_lossy(),
        url,
    ])?;
    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("path", Json::s(&dest.to_string_lossy())),
    ]))
}

/* -------------------------------- Mods -------------------------------- */

/// 用 bsdtar 读 jar 里的 fabric.mod.json（zip + deflate 都交给它）
fn read_fabric_meta(jar: &Path) -> Option<Json> {
    let out = Command::new("tar").arg("-xOf").arg(jar).arg("fabric.mod.json").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim_start_matches('\u{feff}').to_string();
    Json::parse(&text).ok()
}

/// 没有 fabric.mod.json 时退回文件名解析：name-1.2.3.jar
fn fallback_meta(file: &str) -> (String, String, String) {
    let base = file.trim_end_matches(".jar").trim_end_matches(".JAR").to_string();
    if let Some(idx) = base.rfind('-') {
        let (name, ver) = base.split_at(idx);
        let version = ver.trim_start_matches('-');
        if version.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            return (name.to_string(), version.to_string(), name.to_lowercase().replace(' ', "-"));
        }
    }
    (base.clone(), String::new(), base.to_lowercase().replace(' ', "-"))
}

/// 单个 jar 的元数据（每读一个 jar 要起一次 bsdtar，所以扫描时要并发）
fn mod_meta_of(path: &Path, name: &str) -> Json {
    let meta = std::fs::metadata(path);
    let size = meta.as_ref().map(|m| m.len() as f64).unwrap_or(0.0);
    let mtime = meta
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);

    let (id, display, version, env, depends) = match read_fabric_meta(path) {
        Some(meta) => {
            let dep_names: Vec<Json> = match meta.get("depends") {
                Some(Json::Obj(items)) => items.iter().map(|(k, _)| Json::s(k)).collect(),
                _ => Vec::new(),
            };
            (
                meta.get("id").and_then(|v| v.str()).unwrap_or("").to_string(),
                meta.get("name")
                    .and_then(|v| v.str())
                    .or_else(|| meta.get("id").and_then(|v| v.str()))
                    .unwrap_or(name)
                    .to_string(),
                meta.get("version").and_then(|v| v.str()).unwrap_or("").to_string(),
                match meta.get("environment").and_then(|v| v.str()) {
                    Some("client") => "client".to_string(),
                    Some("server") => "server".to_string(),
                    _ => "*".to_string(),
                },
                dep_names,
            )
        }
        None => {
            let (display, version, id) = fallback_meta(name);
            (id, display, version, "*".to_string(), Vec::new())
        }
    };

    Json::obj(vec![
        ("file", Json::s(name)),
        ("path", Json::s(&path.to_string_lossy())),
        ("id", Json::s(&id)),
        ("name", Json::s(&display)),
        ("version", Json::s(&version)),
        ("environment", Json::s(&env)),
        ("depends", Json::Arr(depends)),
        ("size", Json::n(size)),
        ("mtime", Json::n(mtime)),
    ])
}

fn scan_mods(dir: &str) -> Result<Json, String> {
    let rd = std::fs::read_dir(dir).map_err(|e| format!("读取目录失败：{e}"))?;

    let mut targets: Vec<(String, PathBuf)> = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".jar") {
            continue;
        }
        let path = entry.path();
        if path.is_file() {
            targets.push((name, path));
        }
    }

    // 每个 jar 都要起一次 bsdtar；串行时 25 个约 0.6 秒，并发后降到 0.1~0.2 秒
    let workers = targets.len().clamp(1, 6);
    let chunk = targets.len().div_ceil(workers);
    let mut out: Vec<Json> = Vec::with_capacity(targets.len());
    std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for part in targets.chunks(chunk.max(1)) {
            handles.push(scope.spawn(move || {
                part.iter()
                    .map(|(name, path)| mod_meta_of(path, name))
                    .collect::<Vec<Json>>()
            }));
        }
        for handle in handles {
            if let Ok(items) = handle.join() {
                out.extend(items);
            }
        }
    });

    out.sort_by(|a, b| {
        a.get("name")
            .and_then(|v| v.str())
            .unwrap_or("")
            .cmp(b.get("name").and_then(|v| v.str()).unwrap_or(""))
    });
    Ok(Json::Arr(out))
}

fn toggle_mod(jar_path: &str, enable: bool) -> Result<Json, String> {
    let path = Path::new(jar_path);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let lower = name.to_lowercase();

    if enable {
        if !lower.ends_with(".jar.disabled") {
            return Err("这个文件不是被禁用的状态".into());
        }
        let target = path.with_file_name(name.trim_end_matches(".disabled").to_string());
        std::fs::rename(path, &target).map_err(|e| format!("启用失败：{e}"))?;
    } else {
        if !lower.ends_with(".jar") {
            return Err("只能禁用 .jar".into());
        }
        let target = path.with_file_name(format!("{name}.disabled"));
        std::fs::rename(path, &target).map_err(|e| format!("禁用失败：{e}"))?;
    }
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

/* ---------------------------- 桌面能力对齐 ---------------------------- */

/// 打开文件/文件夹/URL（等价于双击）
fn open_path(target: &str) -> Result<Json, String> {
    if target.is_empty() {
        return Err("缺少路径".into());
    }
    Command::new("cmd")
        .args(["/c", "start", "", target])
        .spawn()
        .map_err(|e| format!("打开失败：{e}"))?;
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

fn copy_dir(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
            let _ = std::fs::metadata(entry.path()).and_then(|m| {
                if let Ok(t) = m.modified() {
                    let _ = set_mtime(&to, t);
                }
                Ok(())
            });
        }
    }
    Ok(())
}

fn set_mtime(path: &Path, t: SystemTime) -> std::io::Result<()> {
    // 标准库没有 set_mtime；用 PowerShell 补一下代价太大，这里忽略，保持简单
    let _ = (path, t);
    Ok(())
}

fn copy_path(src: &str, dest: &str) -> Result<Json, String> {
    let src_path = Path::new(src);
    if !src_path.exists() {
        return Err("源文件不存在".into());
    }
    let dest_path = Path::new(dest);
    if let Some(parent) = dest_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if src_path.is_dir() {
        copy_dir(src_path, dest_path).map_err(|e| format!("复制目录失败：{e}"))?;
    } else {
        std::fs::copy(src_path, dest_path).map_err(|e| format!("复制文件失败：{e}"))?;
    }
    Ok(Json::obj(vec![("ok", Json::Bool(true)), ("dest", Json::s(dest))]))
}

fn remove_path(target: &str) -> Result<Json, String> {
    let path = Path::new(target);
    if !path.exists() {
        return Ok(Json::obj(vec![("ok", Json::Bool(true))]));
    }
    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|e| format!("删除目录失败：{e}"))?;
    } else {
        std::fs::remove_file(path).map_err(|e| format!("删除文件失败：{e}"))?;
    }
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

fn props_read(file: &str) -> Result<Json, String> {
    let text = std::fs::read_to_string(file).map_err(|e| format!("读取失败：{e}"))?;
    let mut items = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once('=') {
            items.push((k.trim().to_string(), Json::s(v.trim())));
        }
    }
    Ok(Json::Obj(items))
}

fn props_write(file: &str, props: &Json) -> Result<Json, String> {
    let Json::Obj(items) = props else {
        return Err("属性必须是对象".into());
    };
    let mut content = String::from("#Minecraft server properties\n");
    if let Ok(meta) = std::fs::metadata(file) {
        if let Ok(modified) = meta.modified() {
            if let Ok(dur) = modified.duration_since(UNIX_EPOCH) {
                content.push_str(&format!("#{}\n", dur.as_secs()));
            }
        }
    }
    for (k, v) in items {
        let value = match v {
            Json::Str(s) => s.clone(),
            Json::Num(n) => {
                if n.fract() == 0.0 {
                    format!("{}", *n as i64)
                } else {
                    format!("{n}")
                }
            }
            Json::Bool(b) => b.to_string(),
            Json::Null => String::new(),
            other => other.to_string(),
        };
        content.push_str(&format!("{k}={value}\n"));
    }
    std::fs::write(file, content).map_err(|e| format!("写入失败：{e}"))?;
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

fn config_reset(shared: &Shared) -> Result<Json, String> {
    let mut state = shared.lock().unwrap();
    state.config = default_config();
    save_config(&state.config_path, &state.config.clone());
    Ok(state.config.clone())
}

/// AI 知识库：编译期内嵌，首次调用时落到磁盘，返回目录路径给提示词用
fn ai_docs_path() -> Result<Json, String> {
    let dir = std::env::var("APPDATA")
        .map(|p| PathBuf::from(p).join("wulons-mcss").join("ai"))
        .unwrap_or_else(|_| std::env::temp_dir().join("wulons-mcss-ai"));
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败：{e}"))?;
    std::fs::write(dir.join("knowledge.md"), KNOWLEDGE_MD).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::write(dir.join("README.md"), AI_README).map_err(|e| format!("写入失败：{e}"))?;
    Ok(Json::s(&dir.to_string_lossy()))
}

fn parse_java_major(text: &str) -> Option<i64> {
    let idx = text.find("version \"")?;
    let rest = &text[idx + 9..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let mut parts = digits.split('.');
    let first: i64 = parts.next()?.parse().ok()?;
    if first == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(first)
    }
}

fn probe_java(path: &str) -> Option<Json> {
    let out = Command::new(path)
        .arg("-version")
        .output()
        .ok()?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stderr), String::from_utf8_lossy(&out.stdout));
    let major = parse_java_major(&text)?;
    let version = text
        .split("version \"")
        .nth(1)
        .and_then(|s| s.split('"').next())
        .map(String::from)
        .unwrap_or_default();
    Some(Json::obj(vec![
        ("path", Json::s(path)),
        ("major", Json::n(major as f64)),
        ("version", Json::s(&version)),
    ]))
}

fn detect_java() -> Result<Json, String> {
    let mut candidates: Vec<String> = Vec::new();
    let mut push = |p: PathBuf| {
        let s = p.to_string_lossy().to_string();
        if !candidates.contains(&s) {
            candidates.push(s);
        }
    };

    if let Ok(home) = std::env::var("JAVA_HOME") {
        push(PathBuf::from(home).join("bin").join("java.exe"));
    }

    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();

    // 官方启动器与 Microsoft Store 版的运行时
    for runtime_root in [
        PathBuf::from(&appdata).join(".minecraft").join("runtime"),
        PathBuf::from(&local)
            .join("Packages")
            .join("Microsoft.4297127D64EC6_8wekyb3d8bbwe")
            .join("LocalCache")
            .join("Local")
            .join("runtime"),
    ] {
        if let Ok(rd) = std::fs::read_dir(&runtime_root) {
            for entry in rd.flatten() {
                let java = entry.path().join("bin").join("java.exe");
                if java.exists() {
                    push(java);
                }
            }
        }
    }

    // 常见安装目录
    for root in [
        "C:\\Program Files\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Microsoft",
        "C:\\Program Files\\Zulu",
        "C:\\Program Files\\BellSoft",
    ] {
        if let Ok(rd) = std::fs::read_dir(root) {
            for entry in rd.flatten() {
                let java = entry.path().join("bin").join("java.exe");
                if java.exists() {
                    push(java);
                }
            }
        }
    }

    // PATH 里的 java
    if let Ok(out) = Command::new("where").arg("java").output() {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let line = line.trim();
                if line.to_lowercase().ends_with("java.exe") {
                    push(PathBuf::from(line));
                }
            }
        }
    }

    let mut found: Vec<Json> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in candidates {
        if !seen.insert(path.clone()) {
            continue;
        }
        if let Some(info) = probe_java(&path) {
            found.push(info);
        }
    }
    found.sort_by(|a, b| {
        b.get("major")
            .and_then(|v| v.num())
            .unwrap_or(0.0)
            .partial_cmp(&a.get("major").and_then(|v| v.num()).unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(Json::Arr(found))
}

/* ------------------------------ 原生对话框 ------------------------------ */

/// 用 PowerShell 的系统对话框顶替 Electron 的 dialog —— 网页版也要能选目录
fn ps_run(script: &str) -> Result<String, String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", script])
        .output()
        .map_err(|e| format!("调用 PowerShell 失败：{e}"))?;
    if !out.status.success() {
        return Err(format!(
            "对话框失败：{}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn ps_quote(text: &str) -> String {
    text.replace('\'', "''")
}

fn dialog_run(kind: &str, title: &str, default_name: &str, filter: &str) -> Result<Json, String> {
    // 测试模式：不弹窗，直接把属性读回来 —— 这样能验证 PowerShell 脚本本身是否合法
    let test = std::env::var("MCSS_DIALOG_TEST").is_ok();

    let mut parts: Vec<String> = vec!["Add-Type -AssemblyName System.Windows.Forms | Out-Null;".into()];
    match kind {
        "folder" => {
            parts.push("$d = New-Object System.Windows.Forms.FolderBrowserDialog;".into());
            parts.push(format!("$d.Description = '{}';", ps_quote(title)));
            parts.push("$d.ShowNewFolderButton = $true;".into());
            if test {
                parts.push("$d.SelectedPath = 'C:\\Windows';".into());
            }
        }
        "open" => {
            parts.push("$d = New-Object System.Windows.Forms.OpenFileDialog;".into());
            parts.push(format!("$d.Title = '{}';", ps_quote(title)));
            parts.push(format!("$d.Filter = '{}';", ps_quote(filter)));
        }
        _ => {
            parts.push("$d = New-Object System.Windows.Forms.SaveFileDialog;".into());
            parts.push(format!("$d.Title = '{}';", ps_quote(title)));
            parts.push(format!("$d.Filter = '{}';", ps_quote(filter)));
            parts.push(format!("$d.FileName = '{}';", ps_quote(default_name)));
        }
    }
    if !test {
        parts.push("if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 };".into());
    }
    parts.push(if kind == "folder" {
        "Write-Output $d.SelectedPath".into()
    } else {
        "Write-Output $d.FileName".into()
    });

    let script = parts.join(" ");
    let out = ps_run(&script)?;
    Ok(if out.is_empty() { Json::Null } else { Json::s(&out) })
}

fn dialog_open_directory(title: &str) -> Result<Json, String> {
    dialog_run("folder", title, "", "")
}

fn dialog_open_file(title: &str, filter: &str) -> Result<Json, String> {
    dialog_run("open", title, "", filter)
}

fn dialog_save_file(title: &str, default_name: &str, filter: &str) -> Result<Json, String> {
    dialog_run("save", title, default_name, filter)
}

/* ------------------------------ 开服预检 ------------------------------ */

fn issue(id: &str, level: &str, title: &str, detail: &str, fix: Option<&str>) -> Json {
    Json::obj(vec![
        ("id", Json::s(id)),
        ("level", Json::s(level)),
        ("title", Json::s(title)),
        ("detail", Json::s(detail)),
        ("fix", fix.map(Json::s).unwrap_or(Json::Null)),
    ])
}

fn check_eula(dir: &Path) -> Option<Json> {
    let path = dir.join("eula.txt");
    if !path.exists() {
        return Some(issue(
            "eula-missing",
            "warn",
            "还没同意 EULA",
            "首次启动会自动生成 eula.txt，需要改成 eula=true",
            Some("accept-eula"),
        ));
    }
    let Ok(text) = std::fs::read_to_string(&path) else { return None };
    // 容忍 `eula = true` / `EULA=TRUE`
    let compact: String = text
        .to_lowercase()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if compact.contains("eula=true") {
        None
    } else {
        Some(issue(
            "eula-false",
            "error",
            "EULA 未接受",
            "eula.txt 里不是 true，服务器会直接退出",
            Some("accept-eula"),
        ))
    }
}

fn check_datapacks(dir: &Path) -> Option<Json> {
    let root = dir.join("world").join("datapacks");
    let Ok(entries) = std::fs::read_dir(&root) else { return None };
    let mut broken: Vec<String> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("mwm-") || !entry.path().is_dir() {
            continue;
        }
        let pack = entry.path();
        let Ok(namespaces) = std::fs::read_dir(pack.join("data")) else { continue };
        for ns in namespaces.flatten() {
            let ns_name = ns.file_name().to_string_lossy().to_string();
            let type_dir = pack.join("data").join(&ns_name).join("dimension_type");
            let Ok(files) = std::fs::read_dir(&type_dir) else { continue };
            for file in files.flatten() {
                let file_name = file.file_name().to_string_lossy().to_string();
                if !file_name.ends_with(".json") {
                    continue;
                }
                let ok = std::fs::read_to_string(file.path())
                    .ok()
                    .and_then(|t| Json::parse(&t).ok())
                    .and_then(|j| j.get("has_ender_dragon_fight").and_then(|v| v.bool()))
                    .is_some();
                if !ok {
                    broken.push(format!("{name}/{ns_name}/{file_name}"));
                }
            }
        }
    }

    if broken.is_empty() {
        return None;
    }
    let mut item = issue(
        "datapack-format",
        "error",
        &format!("{} 个维度定义是旧格式", broken.len()),
        "26.1 的数据包会让服务器在「加载注册表」阶段直接失败，无法启动。",
        Some("repair-datapacks"),
    );
    if let Json::Obj(ref mut items) = item {
        items.push((
            "samples".into(),
            Json::Arr(broken.iter().take(3).map(|s| Json::s(s)).collect()),
        ));
    }
    Some(item)
}

/// 物理内存与磁盘：标准库没有，借 PowerShell 拿数值（结果缓存，别每次预检都跑）
fn ps_number(script: &str) -> Option<f64> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).trim().parse::<f64>().ok()
}

fn total_memory_gb() -> Option<f64> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<f64>> = OnceLock::new();
    *CACHE.get_or_init(|| {
        ps_number("(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB").map(|gb| gb.round())
    })
}

fn free_disk_gb(dir: &Path) -> Option<f64> {
    let root = dir.components().next().map(|c| c.as_os_str().to_string_lossy().to_string())?;
    let drive = root.trim_end_matches('\\').to_string();
    ps_number(&format!(
        "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='{drive}'\").FreeSpace / 1GB"
    ))
}

fn check_port(port: u16) -> Option<Json> {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    if TcpStream::connect_timeout(&addr, Duration::from_millis(600)).is_ok() {
        return Some(issue(
            "port-busy",
            "error",
            &format!("端口 {port} 已被占用"),
            "可能已经有一个服务器在跑，或者别的程序占了这个端口",
            Some("change-port"),
        ));
    }
    None
}

fn preflight(shared: &Shared, instance_id: &str) -> Result<Json, String> {
    let instance = {
        let state = shared.lock().unwrap();
        instance_by_id(&state.config, instance_id).cloned()
    };
    let instance = instance.ok_or("实例不存在")?;

    let dir = instance.get("dir").and_then(|v| v.str()).unwrap_or("").to_string();
    if dir.is_empty() {
        return Ok(Json::obj(vec![("ok", Json::Bool(false)), ("issues", Json::Arr(vec![]))]));
    }
    let dir_path = PathBuf::from(&dir);
    let mut issues: Vec<Json> = Vec::new();

    // Java
    let java = instance.get("javaPath").and_then(|v| v.str()).unwrap_or("");
    if java.is_empty() {
        issues.push(issue("java-missing", "error", "没有指定 Java", "实例设置里没有 Java 路径，服务器无法启动。", Some("set-java")));
    } else if (java.contains('\\') || java.contains('/')) && !Path::new(java).exists() {
        issues.push(issue("java-path", "error", "Java 路径不存在", java, Some("set-java")));
    }

    // 服务端 jar
    if !dir_path.join("fabric-server-launch.jar").exists() && !dir_path.join("server.jar").exists() {
        issues.push(issue(
            "jar-missing",
            "error",
            "找不到服务端 jar",
            &format!("在 {dir} 下既没有 fabric-server-launch.jar 也没有 server.jar"),
            Some("reinstall"),
        ));
    }

    if let Some(item) = check_eula(&dir_path) {
        issues.push(item);
    }
    if let Some(item) = check_datapacks(&dir_path) {
        issues.push(item);
    }

    let port = instance.get("port").and_then(|v| v.num()).unwrap_or(0.0) as u16;
    if port > 0 {
        if let Some(item) = check_port(port) {
            issues.push(item);
        }
    }

    let max_gb = instance.get("memoryMax").and_then(|v| v.num()).unwrap_or(0.0);
    if max_gb > 0.0 {
        if let Some(total) = total_memory_gb() {
            if max_gb > total {
                issues.push(issue(
                    "memory-too-high",
                    "warn",
                    &format!("最大内存 {max_gb:.0}G 超过物理内存"),
                    &format!("本机只有约 {total:.0}G，设这么高容易触发系统换页反而更卡"),
                    Some("lower-memory"),
                ));
            }
        }
    }

    if let Some(free) = free_disk_gb(&dir_path) {
        if free < 2.0 {
            issues.push(issue(
                "disk-low",
                "warn",
                "磁盘剩余空间不足 2G",
                &format!("当前约 {free:.1}G"),
                None,
            ));
        }
    }

    let ok = !issues
        .iter()
        .any(|i| i.get("level").and_then(|v| v.str()) == Some("error"));

    Ok(Json::obj(vec![
        ("ok", Json::Bool(ok)),
        ("issues", Json::Arr(issues)),
        ("checkedAt", Json::n(now_ms())),
    ]))
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

/* ------------------------------ 版本与下载 ------------------------------ */

const MC_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
const PAPER_API: &str = "https://fill.papermc.io/v3";
const PURPUR_API: &str = "https://api.purpurmc.org/v2";
/// 装了哪个核心写在这里，导入别人的服务器时不用靠猜
const MARKER: &str = ".mcss-server.json";
/// GitHub 直连在国内常不通，按顺序回退；空串表示直连
const MIRRORS: [&str; 4] = ["", "https://gh-proxy.com/", "https://ghfast.top/", "https://ghproxy.net/"];

fn versions_minecraft() -> Result<Json, String> {
    let json = get_json(MC_MANIFEST)?;
    let list = json.get("versions").and_then(|v| v.arr()).cloned().unwrap_or_default();
    let out = list
        .iter()
        .map(|v| {
            let s = |k: &str| Json::s(v.get(k).and_then(|x| x.str()).unwrap_or(""));
            Json::obj(vec![
                ("id", s("id")),
                ("type", s("type")),
                ("releaseTime", s("releaseTime")),
                ("url", s("url")),
            ])
        })
        .collect();
    Ok(Json::Arr(out))
}

/// Fabric Loader 列表（内部形状：{version, stable}，stable 排前面）
fn fabric_loader_list(mc: &str) -> Result<Json, String> {
    let url = format!("{FABRIC_META}/versions/loader/{}", urlencode(mc));
    let json = get_json(&url)?;
    let list = json.arr().ok_or("Fabric 返回格式不对")?;
    let mut out: Vec<Json> = list
        .iter()
        .filter_map(|l| {
            let loader = l.get("loader")?;
            let version = loader.get("version").and_then(|v| v.str())?;
            Some(Json::obj(vec![
                ("version", Json::s(version)),
                ("stable", Json::Bool(loader.get("stable").and_then(|v| v.bool()).unwrap_or(false))),
            ]))
        })
        .collect();
    // stable 排前面
    out.sort_by_key(|v| !v.get("stable").and_then(|x| x.bool()).unwrap_or(false));
    Ok(Json::Arr(out))
}

/// 对外（IPC）形状：**字符串数组**，契约与桌面版 versions.js、渲染层 api.ts 一致。
/// 曾经这里吐的是 {version, stable} 对象，渲染层当字符串塞进 <option>，
/// React #31（对象不能当子节点）→ 整棵树卸载 → 黑屏。
fn fabric_loaders(mc: &str) -> Result<Json, String> {
    let list = fabric_loader_list(mc)?;
    let versions: Vec<Json> = list
        .arr()
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.get("version").and_then(|x| x.str()).map(Json::s))
                .collect::<Vec<Json>>()
        })
        .unwrap_or_default();
    Ok(Json::Arr(versions))
}

/* --------------------------- Paper / Purpur（插件服） --------------------------- */

fn paper_builds(mc: &str) -> Result<Json, String> {
    let url = format!("{PAPER_API}/projects/paper/versions/{}/builds", urlencode(mc));
    let json = get_json(&url)?;
    let list = json.arr().ok_or("Paper 返回格式不对")?;
    let mut out: Vec<Json> = Vec::new();
    for b in list {
        if b.get("downloads").and_then(|d| d.get("server:default")).is_none() {
            continue;
        }
        if let Some(id) = b.get("id").and_then(|v| v.num()) {
            out.push(Json::s(&format!("{}", id as i64)));
        }
    }
    Ok(Json::Arr(out))
}

fn purpur_builds(mc: &str) -> Result<Json, String> {
    let url = format!("{PURPUR_API}/purpur/{}", urlencode(mc));
    let json = get_json(&url)?;
    let all = json
        .get("builds")
        .and_then(|b| b.get("all"))
        .and_then(|a| a.arr())
        .cloned()
        .unwrap_or_default();
    // Purpur 给的是升序，倒过来让最新的在前
    let out: Vec<Json> = all
        .iter()
        .rev()
        .map(|v| Json::s(&format!("{}", v.num().unwrap_or(0.0) as i64)))
        .collect();
    Ok(Json::Arr(out))
}

fn install_paper(
    mc: &str,
    build: &str,
    dir: &Path,
    progress: &dyn Fn(&str, i32, &str),
) -> Result<String, String> {
    let url = format!("{PAPER_API}/projects/paper/versions/{}/builds", urlencode(mc));
    let json = get_json(&url)?;
    let list = json.arr().ok_or("Paper 返回格式不对")?;
    let usable: Vec<&Json> = list
        .iter()
        .filter(|b| b.get("downloads").and_then(|d| d.get("server:default")).is_some())
        .collect();
    if usable.is_empty() {
        return Err(format!("Paper 还没有 {mc} 的构建"));
    }
    let chosen = if build.is_empty() {
        usable[0]
    } else {
        *usable
            .iter()
            .find(|b| {
                b.get("id")
                    .and_then(|v| v.num())
                    .map(|n| format!("{}", n as i64))
                    .as_deref()
                    == Some(build)
            })
            .ok_or_else(|| format!("Paper {mc} 没有 build {build}"))?
    };

    let id = chosen
        .get("id")
        .and_then(|v| v.num())
        .map(|n| format!("{}", n as i64))
        .unwrap_or_else(|| "unknown".to_string());
    let dl = chosen
        .get("downloads")
        .and_then(|d| d.get("server:default"))
        .ok_or("Paper 这个构建没有服务端 jar")?;
    let file = dl.get("url").and_then(|v| v.str()).ok_or("Paper 缺少下载地址")?;

    progress("下载 Paper", 20, "");
    download_to(file, &dir.join("server.jar"), &[], None)?;
    Ok(id)
}

fn install_purpur(
    mc: &str,
    build: &str,
    dir: &Path,
    progress: &dyn Fn(&str, i32, &str),
) -> Result<String, String> {
    let ver = if build.is_empty() {
        purpur_builds(mc)
            .ok()
            .and_then(|j| j.arr().and_then(|a| a.first()).and_then(|v| v.str()).map(String::from))
            .unwrap_or_else(|| "latest".to_string())
    } else {
        build.to_string()
    };
    let url = format!("{PURPUR_API}/purpur/{}/{}/download", urlencode(mc), urlencode(&ver));
    progress("下载 Purpur", 20, "");
    download_to(&url, &dir.join("server.jar"), &[], None)?;
    Ok(ver)
}

fn write_marker(dir: &Path, server_type: &str, mc: &str, build: &str) {
    let payload = Json::obj(vec![
        ("serverType", Json::s(server_type)),
        ("mc", Json::s(mc)),
        ("build", Json::s(build)),
    ]);
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join(MARKER), payload.to_string());
}

/// 猜一个目录用的是哪种服务端：自家标记 → 加载器痕迹 → 插件服痕迹 → 单 jar
fn detect_server(dir: &str) -> Result<Json, String> {
    let root = Path::new(dir);
    if dir.is_empty() || !root.exists() {
        return Ok(Json::Null);
    }
    let has = |rel: &str| root.join(rel).exists();

    if let Ok(text) = std::fs::read_to_string(root.join(MARKER)) {
        if let Ok(m) = Json::parse(&text) {
            if let Some(t) = m.get("serverType").and_then(|v| v.str()) {
                if !t.is_empty() {
                    return Ok(Json::obj(vec![
                        ("serverType", Json::s(t)),
                        ("mc", m.get("mc").cloned().unwrap_or(Json::Null)),
                        ("build", m.get("build").cloned().unwrap_or(Json::Null)),
                        ("source", Json::s("marker")),
                        ("confidence", Json::s("high")),
                    ]));
                }
            }
        }
    }

    let hit = |server_type: &str, source: &str, confidence: &str| {
        Some(Json::obj(vec![
            ("serverType", Json::s(server_type)),
            ("source", Json::s(source)),
            ("confidence", Json::s(confidence)),
        ]))
    };

    let found = if has("libraries/net/neoforged") {
        hit("neoforge", "libraries", "high")
    } else if has("libraries/net/minecraftforge") {
        hit("forge", "libraries", "high")
    } else if has("purpur.yml") {
        hit("purpur", "purpur.yml", "medium")
    } else if has("config/paper-global.yml") || has("paper.yml") || has("version_history.json") {
        hit("paper", "paper-config", "medium")
    } else if has("fabric-server-launch.jar") || has(".fabric") {
        hit("fabric", "fabric", "high")
    } else if has("plugins") {
        hit("paper", "plugins/", "guess")
    } else if has("mods") {
        hit("fabric", "mods/", "guess")
    } else if has("server.jar") {
        hit("vanilla", "server.jar", "guess")
    } else {
        None
    };

    Ok(found.unwrap_or(Json::Null))
}

/// 下载到 dest：先写 .part，成功后再改名，避免半截文件被当成可用
/// 下载到 dest：断点续传（curl -C -）+ 多源回退 + 可选 sha1 校验
/// 下完先落到 .part，校验通过才改名，半截文件永远不会被当成可用文件。
fn download_to(url: &str, dest: &Path, mirrors: &[String], expected_sha1: Option<&str>) -> Result<u64, String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    let part = dest.with_extension(format!(
        "{}part",
        dest.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!("{e}."))
            .unwrap_or_default()
    ));

    let candidates: Vec<String> = if mirrors.is_empty() {
        vec![url.to_string()]
    } else {
        mirrors.iter().map(|p| format!("{p}{url}")).collect()
    };

    let mut last_error = String::from("下载失败");
    for candidate in candidates {
        // 第一遍尝试续传；服务端不支持 Range（curl 退出码 33）就删掉重来
        for resume in [true, false] {
            if !resume {
                let _ = std::fs::remove_file(&part);
            }
            let mut args: Vec<String> = vec![
                "-L".into(),
                "--fail".into(),
                "--connect-timeout".into(),
                "10".into(),
                "--max-time".into(),
                "300".into(),
                "--retry".into(),
                "2".into(),
                "-H".into(),
                format!("User-Agent: {UA}"),
            ];
            if resume && part.exists() && std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0) > 0 {
                args.push("-C".into());
                args.push("-".into());
            }
            args.push("-o".into());
            args.push(part.to_string_lossy().to_string());
            args.push(candidate.clone());

            let borrowed: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            match curl(&borrowed) {
                Ok(_) => {
                    // 校验：对不上就丢掉，换下一个源
                    if let Some(expected) = expected_sha1 {
                        let actual = hash_file(&part).unwrap_or_default();
                        if !actual.eq_ignore_ascii_case(expected) {
                            let _ = std::fs::remove_file(&part);
                            last_error = "校验不通过（文件可能被截断或源被篡改）".into();
                            break;
                        }
                    }

                    if dest.exists() {
                        let _ = std::fs::remove_file(dest);
                    }
                    // 刚下完的文件可能被杀软扫一下，rename 会短暂失败：重试，再退化成复制
                    let mut moved = false;
                    for _ in 0..8 {
                        if std::fs::rename(&part, dest).is_ok() {
                            moved = true;
                            break;
                        }
                        thread::sleep(Duration::from_millis(400));
                    }
                    if !moved {
                        std::fs::copy(&part, dest).map_err(|e| format!("写入文件失败：{e}"))?;
                        let _ = std::fs::remove_file(&part);
                    }
                    return Ok(std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0));
                }
                Err(e) => {
                    last_error = e;
                    // 33 = 服务端不支持 Range，删掉 part 再从头下
                    if !resume {
                        let _ = std::fs::remove_file(&part);
                        break;
                    }
                }
            }
        }
    }
    Err(last_error)
}

fn install_server(shared: &Shared, opts: &Json) -> Result<Json, String> {
    let dir = opts.get("dir").and_then(|v| v.str()).unwrap_or("");
    let mc = opts.get("mc").and_then(|v| v.str()).unwrap_or("");
    // v28 起用 serverType；老 UI 送的还是 loader
    let loader = opts
        .get("serverType")
        .and_then(|v| v.str())
        .or_else(|| opts.get("loader").and_then(|v| v.str()))
        .unwrap_or("vanilla");
    let loader_version = opts.get("loaderVersion").and_then(|v| v.str()).unwrap_or("");
    let build = opts.get("build").and_then(|v| v.str()).unwrap_or("");
    if dir.is_empty() || mc.is_empty() {
        return Err("缺少安装参数".into());
    }
    let dir_path = PathBuf::from(dir);
    std::fs::create_dir_all(&dir_path).map_err(|e| format!("创建目录失败：{e}"))?;

    let progress = |stage: &str, percent: i32, detail: &str| {
        let mut state = shared.lock().unwrap();
        broadcast(
            &mut state,
            "versions:progress",
            Json::obj(vec![
                ("stage", Json::s(stage)),
                ("percent", Json::n(percent as f64)),
                ("detail", Json::s(detail)),
            ]),
        );
    };

    if loader == "paper" {
        progress("下载 Paper", 5, "");
        let chosen = install_paper(mc, build, &dir_path, &progress)?;
        write_marker(&dir_path, "paper", mc, &chosen);
        progress("完成", 100, "");
        return Ok(Json::obj(vec![("ok", Json::Bool(true)), ("build", Json::s(&chosen))]));
    }

    if loader == "purpur" {
        progress("下载 Purpur", 5, "");
        let chosen = install_purpur(mc, build, &dir_path, &progress)?;
        write_marker(&dir_path, "purpur", mc, &chosen);
        progress("完成", 100, "");
        return Ok(Json::obj(vec![("ok", Json::Bool(true)), ("build", Json::s(&chosen))]));
    }

    if loader == "fabric" {
        progress("解析 Fabric Loader", 2, "");
        let loaders = fabric_loader_list(mc)?;
        let chosen = if !loader_version.is_empty() {
            loader_version.to_string()
        } else {
            loaders
                .arr()
                .and_then(|list| list.first())
                .and_then(|l| l.get("version"))
                .and_then(|v| v.str())
                .ok_or_else(|| format!("Fabric 没有适配 {mc} 的 Loader"))?
                .to_string()
        };

        let installer = get_json(&format!("{FABRIC_META}/versions/installer"))
            .ok()
            .and_then(|j| j.arr().and_then(|a| a.first()).and_then(|v| v.get("version")).and_then(|v| v.str()).map(String::from))
            .unwrap_or_else(|| "1.0.1".to_string());

        let url = format!(
            "{FABRIC_META}/versions/loader/{}/{}/{}/server/jar",
            urlencode(mc),
            urlencode(&chosen),
            urlencode(&installer)
        );
        progress("下载 Fabric 服务端", 5, "");
        let size = download_to(&url, &dir_path.join("fabric-server-launch.jar"), &[], None)?;
        progress("完成", 100, &format!("{:.1} MB", size as f64 / 1048576.0));
        return Ok(Json::obj(vec![
            ("ok", Json::Bool(true)),
            ("loaderVersion", Json::s(&chosen)),
        ]));
    }

    progress("解析版本清单", 3, "");
    let manifest = get_json(MC_MANIFEST)?;
    let entry = manifest
        .get("versions")
        .and_then(|v| v.arr())
        .and_then(|list| list.iter().find(|v| v.get("id").and_then(|x| x.str()) == Some(mc)))
        .cloned()
        .ok_or_else(|| format!("找不到 Minecraft {mc}"))?;
    let detail_url = entry.get("url").and_then(|v| v.str()).ok_or("清单缺少版本地址")?;
    let detail = get_json(detail_url)?;
    let server_url = detail
        .get("downloads")
        .and_then(|d| d.get("server"))
        .and_then(|s| s.get("url"))
        .and_then(|v| v.str())
        .ok_or_else(|| format!("{mc} 没有服务端下载（可能是快照早期版本）"))?
        .to_string();

    let server_sha1 = detail
        .get("downloads")
        .and_then(|d| d.get("server"))
        .and_then(|s| s.get("sha1"))
        .and_then(|v| v.str())
        .map(String::from);

    progress("下载原版服务端", 6, "");
    let size = download_to(&server_url, &dir_path.join("server.jar"), &[], server_sha1.as_deref())?;
    progress("完成", 100, &format!("{:.1} MB", size as f64 / 1048576.0));
    Ok(Json::obj(vec![("ok", Json::Bool(true))]))
}

/* -------------------------------- FRP -------------------------------- */

fn frp_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    PathBuf::from(home).join(".wulons-mcss").join("frp")
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // 跳过 ESC [ ... m 这类控制序列
            if chars.peek() == Some(&'[') {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

fn frp_push_log(state: &mut State, line: &str) {
    let text = strip_ansi(line).trim().to_string();
    if text.is_empty() {
        return;
    }
    state.frp_logs.push(text.clone());
    if state.frp_logs.len() > 500 {
        state.frp_logs.remove(0);
    }
    broadcast(state, "frp:log", Json::s(&text));
}

fn frp_status(state: &State) -> Json {
    Json::obj(vec![
        ("running", Json::Bool(state.frp.is_some())),
        ("pending", Json::Bool(state.frp_pending)),
        ("address", Json::s(&state.frp_address)),
        ("error", Json::s(&state.frp_error)),
    ])
}

fn frp_emit_status(state: &mut State) {
    let status = frp_status(state);
    broadcast(state, "frp:status", status);
}

/// 找 frpc.exe（可能在解压出来的子目录里）
fn find_frpc(dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = find_frpc(&path) {
                    return Some(found);
                }
            } else if path.file_name().and_then(|n| n.to_str()) == Some("frpc.exe") {
                return Some(path);
            }
        }
    }
    None
}

/// 确保 frpc.exe 就位：从 GitHub Release 拉，解压出 exe
fn ensure_frpc(shared: &Shared) -> Result<PathBuf, String> {
    let dir = frp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 FRP 目录失败：{e}"))?;
    let exe = dir.join("frpc.exe");
    if exe.exists() && std::fs::metadata(&exe).map(|m| m.len()).unwrap_or(0) > 1024 {
        return Ok(exe);
    }

    {
        let mut state = shared.lock().unwrap();
        frp_push_log(&mut state, "正在获取 frp 版本信息");
    }
    let release = get_json("https://api.github.com/repos/fatedier/frp/releases/latest")
        .map_err(|e| format!("获取 frp 版本失败：{e}"))?;
    let asset = release
        .get("assets")
        .and_then(|v| v.arr())
        .and_then(|list| {
            list.iter().find(|a| {
                a.get("name")
                    .and_then(|n| n.str())
                    .map(|n| n.ends_with("windows_amd64.zip"))
                    .unwrap_or(false)
            })
        })
        .ok_or("没有找到 Windows 版 frp 安装包")?;
    let url = asset
        .get("browser_download_url")
        .and_then(|v| v.str())
        .ok_or("缺少下载地址")?;
    let name = asset.get("name").and_then(|v| v.str()).unwrap_or("frp.zip");
    // GitHub 的 asset 直链（objects.githubusercontent.com）很难走代理，
    // 用 tag + 文件名拼出 releases 地址，镜像前缀才对它有效
    let tag = release.get("tag_name").and_then(|v| v.str()).unwrap_or("");
    let download_url = if tag.is_empty() {
        url.to_string()
    } else {
        format!("https://github.com/fatedier/frp/releases/download/{tag}/{name}")
    };

    {
        let mut state = shared.lock().unwrap();
        frp_push_log(&mut state, &format!("正在下载 {name}"));
    }

    let zip = dir.join("frp.zip");
    // 上次可能已经把包下好了，别重复下
    let need_download = !zip.exists() || std::fs::metadata(&zip).map(|m| m.len()).unwrap_or(0) < 1024 * 1024;
    if need_download {
        let mirror_prefixes: Vec<String> = MIRRORS.iter().map(|p| p.to_string()).collect();
    download_to(&download_url, &zip, &mirror_prefixes, None)?;
    } else {
        let mut state = shared.lock().unwrap();
        frp_push_log(&mut state, "使用已下载的安装包");
    }

    let extract = dir.join("unpack");
    let _ = std::fs::remove_dir_all(&extract);
    std::fs::create_dir_all(&extract).map_err(|e| format!("创建解压目录失败：{e}"))?;
    let status = Command::new("tar")
        .args(["-xf"])
        .arg(&zip)
        .arg("-C")
        .arg(&extract)
        .status()
        .map_err(|e| format!("解压失败：{e}"))?;
    if !status.success() {
        return Err("解压 frp 安装包失败".into());
    }

    let found = find_frpc(&extract).ok_or("安装包里没有 frpc.exe")?;
    // 刚解压出来的 exe 常被杀软短暂占用：复制 + 重试，比 rename 稳
    let mut last_error = String::new();
    let mut copied = false;
    for _ in 0..6 {
        match std::fs::copy(&found, &exe) {
            Ok(_) => {
                copied = true;
                break;
            }
            Err(e) => {
                last_error = e.to_string();
                thread::sleep(Duration::from_millis(500));
            }
        }
    }
    if !copied {
        return Err(format!("写入 frpc.exe 失败：{last_error}"));
    }
    let _ = std::fs::remove_dir_all(&extract);
    let _ = std::fs::remove_file(&zip);

    let mut state = shared.lock().unwrap();
    frp_push_log(&mut state, "frpc.exe 已就绪");
    Ok(exe)
}

fn build_frpc_toml(profile: &Json) -> String {
    let s = |k: &str, d: &str| {
        profile
            .get(k)
            .and_then(|v| v.str())
            .unwrap_or(d)
            .to_string()
    };
    let n = |k: &str, d: f64| profile.get(k).and_then(|v| v.num()).unwrap_or(d);

    let mut lines = vec![
        format!("serverAddr = \"{}\"", s("serverAddr", "")),
        format!("serverPort = {}", n("serverPort", 7000.0) as i64),
        format!("auth.token = \"{}\"", s("token", "")),
        String::new(),
        "[[proxies]]".to_string(),
        format!("name = \"{}\"", s("name", "minecraft")),
        format!("type = \"{}\"", s("type", "tcp")),
        "localIP = \"127.0.0.1\"".to_string(),
        format!("localPort = {}", n("localPort", 25565.0) as i64),
        format!("remotePort = {}", n("remotePort", 25565.0) as i64),
    ];
    if s("type", "tcp") == "http" || s("type", "tcp") == "https" {
        let domain = s("customDomain", "");
        if !domain.is_empty() {
            lines.push(format!("customDomains = [\"{domain}\"]"));
        }
    }
    format!("{}\n", lines.join("\n"))
}

fn frp_start(shared: &Shared, profile: &Json) -> Result<Json, String> {
    {
        let mut state = shared.lock().unwrap();
        if state.frp.is_some() || state.frp_pending {
            return Err("隧道已在运行或正在启动".into());
        }
        state.frp_error.clear();
        state.frp_address.clear();
        state.frp_pending = true;
        frp_push_log(&mut state, "开始启动隧道");
    }

    // 下载 frpc 可能要几十秒，不能卡住这一次请求：交给后台线程，进度走 frp:log
    let shared_clone = Arc::clone(shared);
    let profile = profile.clone();
    thread::spawn(move || {
        match ensure_frpc(&shared_clone) {
            Ok(exe) => {
                let dir = frp_dir();
                let cfg = dir.join("frpc.toml");
                if let Err(e) = std::fs::write(&cfg, build_frpc_toml(&profile)) {
                    let mut state = shared_clone.lock().unwrap();
                    state.frp_pending = false;
                    state.frp_error = format!("写入配置失败：{e}");
                    frp_emit_status(&mut state);
                    return;
                }

                let spawned = Command::new(&exe)
                    .arg("-c")
                    .arg(&cfg)
                    .current_dir(&dir)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn();

                match spawned {
                    Ok(mut child) => {
                        let server_addr = profile
                            .get("serverAddr")
                            .and_then(|v| v.str())
                            .unwrap_or("")
                            .to_string();
                        let remote_port =
                            profile.get("remotePort").and_then(|v| v.num()).unwrap_or(25565.0) as i64;

                        let mut streams: Vec<Box<dyn std::io::Read + Send>> = Vec::new();
                        if let Some(out) = child.stdout.take() {
                            streams.push(Box::new(out));
                        }
                        if let Some(err) = child.stderr.take() {
                            streams.push(Box::new(err));
                        }
                        for stream in streams {
                            let inner = Arc::clone(&shared_clone);
                            let addr = server_addr.clone();
                            thread::spawn(move || {
                                use std::io::{BufRead, BufReader};
                                for line in BufReader::new(stream).lines().flatten() {
                                    let mut state = inner.lock().unwrap();
                                    frp_push_log(&mut state, &line);
                                    let lower = line.to_lowercase();
                                    if lower.contains("start proxy success") {
                                        state.frp_address = format!("{addr}:{remote_port}");
                                        frp_emit_status(&mut state);
                                    }
                                    if lower.contains("login to server failed")
                                        || lower.contains("connect to server error")
                                        || lower.contains("authorization failed")
                                    {
                                        state.frp_error = strip_ansi(&line).trim().to_string();
                                        frp_emit_status(&mut state);
                                    }
                                }
                            });
                        }

                        let mut state = shared_clone.lock().unwrap();
                        state.frp = Some(child);
                        state.frp_pending = false;
                        frp_push_log(&mut state, "frpc 已启动");
                        frp_emit_status(&mut state);
                    }
                    Err(e) => {
                        let mut state = shared_clone.lock().unwrap();
                        state.frp_pending = false;
                        state.frp_error = format!("启动 frpc 失败：{e}");
                        let message = state.frp_error.clone();
                        frp_push_log(&mut state, &message);
                        frp_emit_status(&mut state);
                    }
                }
            }
            Err(e) => {
                let mut state = shared_clone.lock().unwrap();
                state.frp_pending = false;
                state.frp_error = e.clone();
                frp_push_log(&mut state, &e);
                frp_emit_status(&mut state);
            }
        }
    });

    Ok(Json::obj(vec![("ok", Json::Bool(true)), ("pending", Json::Bool(true))]))
}

fn frp_stop(shared: &Shared) -> Json {
    let mut state = shared.lock().unwrap();
    if let Some(mut child) = state.frp.take() {
        let _ = child.kill();
        state.frp_address.clear();
        frp_push_log(&mut state, "frpc 已停止");
    }
    frp_emit_status(&mut state);
    Json::obj(vec![("ok", Json::Bool(true))])
}

fn frp_status_live(shared: &Shared) -> Json {
    let mut state = shared.lock().unwrap();
    // 进程自己退了（比如配置错）要能反映出来
    if let Some(child) = state.frp.as_mut() {
        if let Ok(Some(code)) = child.try_wait() {
            state.frp = None;
            state.frp_address.clear();
            let msg = format!("frpc 退出（代码 {code}）");
            frp_push_log(&mut state, &msg);
            frp_emit_status(&mut state);
        }
    }
    frp_status(&state)
}

/* ---------------------------- Minecraft 状态 ---------------------------- */

fn put_varint(out: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn read_varint(stream: &mut std::net::TcpStream) -> std::io::Result<i32> {
    use std::io::Read;
    let mut result: i32 = 0;
    let mut shift = 0;
    loop {
        let mut byte = [0u8; 1];
        stream.read_exact(&mut byte)?;
        result |= ((byte[0] & 0x7f) as i32) << shift;
        if byte[0] & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift > 35 {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "varint 过长"));
        }
    }
    Ok(result)
}

fn put_string(out: &mut Vec<u8>, text: &str) {
    put_varint(out, text.len() as i32);
    out.extend_from_slice(text.as_bytes());
}

/// 把 SLP 的 description 字段变成纯文本
fn motd_text(value: &Json) -> String {
    match value {
        Json::Str(s) => s.clone(),
        Json::Obj(items) => {
            let mut out = String::new();
            for (k, v) in items {
                match k.as_str() {
                    "text" => out.push_str(v.str().unwrap_or("")),
                    "extra" => {
                        if let Json::Arr(list) = v {
                            for part in list {
                                out.push_str(&motd_text(part));
                            }
                        }
                    }
                    _ => {}
                }
            }
            out
        }
        _ => String::new(),
    }
}

/** Minecraft Server List Ping：不装插件也能拿到在线人数、版本、MOTD */
fn ping_server(host: &str, port: u16, timeout_ms: u64) -> Result<Json, String> {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};

    let addr = format!("{host}:{port}")
        .to_socket_addrs()
        .map_err(|e| format!("地址解析失败：{e}"))?
        .next()
        .ok_or("地址解析为空")?;

    let start = std::time::Instant::now();
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(timeout_ms))
        .map_err(|e| format!("连不上：{e}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(timeout_ms)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(timeout_ms)));

    // handshake
    let mut payload = Vec::new();
    put_varint(&mut payload, 0x00); // packet id
    put_varint(&mut payload, 47); // protocol version（-1 也行，47 更稳）
    put_string(&mut payload, host);
    payload.extend_from_slice(&port.to_be_bytes());
    put_varint(&mut payload, 1); // next state = status

    let mut frame = Vec::new();
    put_varint(&mut frame, payload.len() as i32);
    frame.extend_from_slice(&payload);
    stream.write_all(&frame).map_err(|e| format!("发送握手失败：{e}"))?;

    // status request
    stream.write_all(&[0x01, 0x00]).map_err(|e| format!("发送请求失败：{e}"))?;

    let len = read_varint(&mut stream).map_err(|e| format!("读取响应长度失败：{e}"))?;
    if len <= 0 || len > 2 * 1024 * 1024 {
        return Err("响应长度异常".into());
    }
    let mut body = vec![0u8; len as usize];
    stream.read_exact(&mut body).map_err(|e| format!("读取响应失败：{e}"))?;

    let latency = start.elapsed().as_millis() as f64;

    // body: varint packetId(0) + string(json)
    let mut cursor = 0usize;
    let mut shift = 0;
    let mut _packet_id = 0i32;
    loop {
        let byte = *body.get(cursor).ok_or("响应被截断")?;
        cursor += 1;
        _packet_id |= ((byte & 0x7f) as i32) << shift;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
    }
    let mut json_len = 0i32;
    let mut shift = 0;
    loop {
        let byte = *body.get(cursor).ok_or("响应被截断")?;
        cursor += 1;
        json_len |= ((byte & 0x7f) as i32) << shift;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
    }
    if json_len <= 0 {
        return Err("状态 JSON 为空".into());
    }
    let end = cursor.saturating_add(json_len as usize).min(body.len());
    let text = String::from_utf8_lossy(&body[cursor..end]).to_string();
    let json = Json::parse(&text).map_err(|e| format!("状态 JSON 解析失败：{e}"))?;

    let players = json.get("players");
    let version = json.get("version");

    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("online", Json::Bool(true)),
        ("ms", Json::n(latency)),
        (
            "players",
            Json::obj(vec![
                ("online", Json::n(players.and_then(|p| p.get("online")).and_then(|v| v.num()).unwrap_or(0.0))),
                ("max", Json::n(players.and_then(|p| p.get("max")).and_then(|v| v.num()).unwrap_or(0.0))),
            ]),
        ),
        ("version", Json::s(version.and_then(|v| v.get("name")).and_then(|v| v.str()).unwrap_or(""))),
        ("motd", Json::s(&motd_text(json.get("description").unwrap_or(&Json::Null)))),
    ]))
}

/* --------------------------- 增量快照（时间机） --------------------------- */

fn snapshots_root(server_dir: &str) -> PathBuf {
    Path::new(server_dir).join("backups")
}
fn snapshots_objects(server_dir: &str) -> PathBuf {
    snapshots_root(server_dir).join("objects")
}
fn snapshots_dir(server_dir: &str) -> PathBuf {
    snapshots_root(server_dir).join("snapshots")
}

fn walk_files(dir: &Path, base: &str, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = if base.is_empty() { name.clone() } else { format!("{base}/{name}") };
        let path = entry.path();
        if path.is_dir() {
            walk_files(&path, &rel, out);
        } else if path.is_file() {
            out.push((rel, path));
        }
    }
}

fn hash_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| format!("读取失败：{e}"))?;
    let mut hasher = sha1::Sha1::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("读取失败：{e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(sha1::hex(&hasher.finish()))
}

fn objects_size(server_dir: &str) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(snapshots_objects(server_dir)) {
        for entry in entries.flatten() {
            total += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    total
}

fn backup_snapshot(server_dir: &str) -> Result<Json, String> {
    let world = Path::new(server_dir).join("world");
    if !world.exists() {
        return Err("还没有 world 目录，先启动一次服务器".into());
    }
    let objects = snapshots_objects(server_dir);
    let snaps = snapshots_dir(server_dir);
    std::fs::create_dir_all(&objects).map_err(|e| format!("创建 objects 失败：{e}"))?;
    std::fs::create_dir_all(&snaps).map_err(|e| format!("创建 snapshots 失败：{e}"))?;

    let mut files = Vec::new();
    walk_files(&world, "", &mut files);

    let mut entries = Vec::new();
    let mut bytes_total: u64 = 0;
    let mut bytes_new: u64 = 0;

    for (rel, path) in &files {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let hash = hash_file(path)?;
        entries.push(Json::obj(vec![
            ("path", Json::s(rel)),
            ("size", Json::n(size as f64)),
            ("hash", Json::s(&hash)),
        ]));
        bytes_total += size;

        let target = objects.join(&hash);
        if !target.exists() {
            std::fs::copy(path, &target).map_err(|e| format!("写入对象失败：{e}"))?;
            bytes_new += size;
        }
    }

    // 同一秒内连打两个快照也不能互相覆盖
    let mut name = format!("snap-{}", now_stamp());
    let mut counter = 2;
    while snaps.join(&name).exists() {
        name = format!("snap-{}-{}", now_stamp(), counter);
        counter += 1;
    }
    let dir = snaps.join(&name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建快照目录失败：{e}"))?;
    let manifest = Json::obj(vec![
        ("version", Json::n(1.0)),
        ("at", Json::n(now_ms())),
        ("source", Json::s("world")),
        ("files", Json::n(entries.len() as f64)),
        ("bytesTotal", Json::n(bytes_total as f64)),
        ("bytesNew", Json::n(bytes_new as f64)),
        ("entries", Json::Arr(entries)),
    ]);
    std::fs::write(dir.join("manifest.json"), manifest.to_string()).map_err(|e| format!("写入清单失败：{e}"))?;

    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("name", Json::s(&name)),
        ("files", Json::n(files.len() as f64)),
        ("bytesTotal", Json::n(bytes_total as f64)),
        ("bytesNew", Json::n(bytes_new as f64)),
    ]))
}

fn read_manifest(server_dir: &str, name: &str) -> Option<Json> {
    let path = snapshots_dir(server_dir).join(name).join("manifest.json");
    std::fs::read_to_string(path).ok().and_then(|t| Json::parse(&t).ok())
}

fn backup_snapshots(server_dir: &str) -> Result<Json, String> {
    let mut items: Vec<(f64, Json)> = Vec::new();
    let stored = objects_size(server_dir) as f64;
    if let Ok(entries) = std::fs::read_dir(snapshots_dir(server_dir)) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(manifest) = read_manifest(server_dir, &name) else { continue };
            let at = manifest.get("at").and_then(|v| v.num()).unwrap_or(0.0);
            items.push((
                at,
                Json::obj(vec![
                    ("name", Json::s(&name)),
                    ("at", Json::n(at)),
                    ("files", Json::n(manifest.get("files").and_then(|v| v.num()).unwrap_or(0.0))),
                    ("bytesTotal", Json::n(manifest.get("bytesTotal").and_then(|v| v.num()).unwrap_or(0.0))),
                    ("bytesNew", Json::n(manifest.get("bytesNew").and_then(|v| v.num()).unwrap_or(0.0))),
                    ("stored", Json::n(stored)),
                ]),
            ));
        }
    }
    items.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Ok(Json::Arr(items.into_iter().map(|(_, v)| v).collect()))
}

fn backup_restore_snapshot(shared: &Shared, server_dir: &str, name: &str) -> Result<Json, String> {
    {
        let state = shared.lock().unwrap();
        if state.status != "stopped" {
            return Err("先把服务器停掉再恢复，否则会写坏存档".into());
        }
    }
    let Some(manifest) = read_manifest(server_dir, name) else {
        return Err("快照不存在或已损坏".into());
    };

    let world = Path::new(server_dir).join("world");
    let parked = Path::new(server_dir).join(format!("world.before-restore-{}", now_stamp()));
    if world.exists() {
        std::fs::rename(&world, &parked).map_err(|e| format!("移走旧存档失败：{e}"))?;
    }

    let entries = manifest.get("entries").and_then(|v| v.arr()).cloned().unwrap_or_default();
    let mut restored = 0;
    for entry in &entries {
        let hash = entry.get("hash").and_then(|v| v.str()).unwrap_or("");
        let rel = entry.get("path").and_then(|v| v.str()).unwrap_or("");
        let source = snapshots_objects(server_dir).join(hash);
        if !source.exists() {
            let _ = std::fs::remove_dir_all(&world);
            let _ = std::fs::rename(&parked, &world);
            return Err(format!("快照缺少对象 {}", &hash[..hash.len().min(8)]));
        }
        let target = world.join(rel.replace('/', "\\"));
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::copy(&source, &target) {
            let _ = std::fs::remove_dir_all(&world);
            let _ = std::fs::rename(&parked, &world);
            return Err(format!("恢复失败，已还原：{e}"));
        }
        restored += 1;
    }

    Ok(Json::obj(vec![
        ("ok", Json::Bool(true)),
        ("restored", Json::n(restored as f64)),
        (
            "parked",
            Json::s(&parked.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()),
        ),
    ]))
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
        "app:info" => {
            let profile = std::env::var("USERPROFILE").unwrap_or_default();
            let appdata = std::env::var("APPDATA").unwrap_or_default();
            Ok(Json::obj(vec![
                ("version", Json::s(PRODUCT_VERSION)),
                ("isPackaged", Json::Bool(true)),
                ("appData", Json::s(&appdata)),
                ("documents", Json::s(&Path::new(&profile).join("Documents").to_string_lossy())),
                ("userName", Json::s(&std::env::var("USERNAME").unwrap_or_default())),
                ("platform", Json::s("agent")),
                ("electron", Json::s("")),
                ("node", Json::s("")),
            ]))
        }
        "dialog:open-directory" => dialog_open_directory("选择文件夹"),
        "dialog:open-file" => {
            let opts = args.first().cloned().unwrap_or(Json::Null);
            let title = opts.get("title").and_then(|v| v.str()).unwrap_or("选择文件");
            let filter = opts
                .get("filters")
                .and_then(|v| v.arr())
                .and_then(|a| a.first())
                .and_then(|f| f.get("extensions"))
                .and_then(|v| v.arr())
                .map(|exts| {
                    let list: Vec<String> = exts
                        .iter()
                        .filter_map(|e| e.str().map(|s| format!("*.{s}")))
                        .collect();
                    format!("文件|{}|所有文件|*.*", list.join(";"))
                })
                .unwrap_or_else(|| "所有文件|*.*".to_string());
            dialog_open_file(title, &filter)
        }
        "dialog:save-file" => {
            let opts = args.first().cloned().unwrap_or(Json::Null);
            let title = opts.get("title").and_then(|v| v.str()).unwrap_or("保存");
            let default_path = opts.get("defaultPath").and_then(|v| v.str()).unwrap_or("");
            let name = Path::new(default_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "保存文件".into());
            let filter = opts
                .get("filters")
                .and_then(|v| v.arr())
                .and_then(|a| a.first())
                .and_then(|f| f.get("extensions"))
                .and_then(|v| v.arr())
                .map(|exts| {
                    let list: Vec<String> = exts
                        .iter()
                        .filter_map(|e| e.str().map(|s| format!("*.{s}")))
                        .collect();
                    format!("文件|{}|所有文件|*.*", list.join(";"))
                })
                .unwrap_or_else(|| "所有文件|*.*".to_string());
            dialog_save_file(title, &name, &filter)
        }
        "app:pick-java" => dialog_open_file("选择 java.exe", "Java|java.exe|所有文件|*.*"),
        "app:open-path" => open_path(arg0),
        "app:open-external" => open_path(arg0),
        "app:detect-java" => detect_java(),
        // 与桌面版保持一致：目前只做「探测并回报」，真正的自动安装是后续版本的事
        "app:ai-docs" => ai_docs_path(),
        "ai:docs-path" => ai_docs_path(),
        "config:reset" => config_reset(shared),
        "fs:copy" => copy_path(arg0, args.get(1).and_then(|v| v.str()).unwrap_or("")),
        "fs:remove" => remove_path(arg0),
        "props:read" => props_read(arg0),
        "props:write" => props_write(arg0, args.get(1).ok_or("缺少属性对象")?),
        "mods:resolve-modrinth" => {
            let list = args.first().and_then(|v| v.arr()).cloned().unwrap_or_default();
            Ok(Json::Arr(resolve_modrinth(&list)))
        }
        "app:detect-launchers" => {            let home = std::env::var("USERPROFILE").unwrap_or_default();
            let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
            let roaming = std::env::var("APPDATA").unwrap_or_default();
            let candidates = [
                ("Plain Craft Launcher 2", format!("{home}\\Desktop\\Plain Craft Launcher 2.exe")),
                ("Plain Craft Launcher 2", "D:\\Games\\Minecraft\\Plain Craft Launcher 2.exe".to_string()),
                ("Minecraft Launcher", "C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe".to_string()),
                ("Minecraft Launcher", "C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe".to_string()),
                ("Modrinth App", format!("{local}\\Programs\\Modrinth App\\Modrinth App.exe")),
                ("Prism Launcher", format!("{roaming}\\PrismLauncher\\prismlauncher.exe")),
                ("HMCL", format!("{home}\\Desktop\\HMCL.exe")),
                ("HMCL", format!("{home}\\Desktop\\HMCL.jar")),
            ];
            let mut out = Vec::new();
            let mut seen = std::collections::HashSet::new();
            for (name, path) in candidates {
                if Path::new(&path).exists() && seen.insert(path.clone()) {
                    out.push(Json::obj(vec![("name", Json::s(name)), ("path", Json::s(&path))]));
                }
            }
            Ok(Json::Arr(out))
        }
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
        "client:launch" => {
            let opts = args.first().ok_or("缺少参数")?;
            let command: Vec<String> = opts
                .get("command")
                .and_then(|v| v.arr())
                .map(|list| list.iter().filter_map(|v| v.str().map(String::from)).collect())
                .unwrap_or_default();
            if command.is_empty() {
                return Err("没有可执行的启动命令".into());
            }
            let mut cmd = Command::new(&command[0]);
            cmd.args(&command[1..]);
            if let Some(cwd) = opts.get("cwd").and_then(|v| v.str()) {
                if !cwd.is_empty() {
                    cmd.current_dir(cwd);
                }
            }
            // 游戏是独立进程：不接 stdin/stdout，用户关掉网页也不影响它
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
            match cmd.spawn() {
                Ok(child) => Ok(Json::obj(vec![
                    ("ok", Json::Bool(true)),
                    ("pid", Json::n(child.id() as f64)),
                ])),
                Err(e) => Ok(Json::obj(vec![
                    ("ok", Json::Bool(false)),
                    ("error", Json::s(&format!("启动失败：{e}"))),
                ])),
            }
        }
        "client:add-server" => add_server(args.first().ok_or("缺少参数")?),
        "client:prepare" => prepare_client(shared, args.first().ok_or("缺少参数")?),
        "client:export-mrpack" => export_mrpack(shared, args.first().ok_or("缺少参数")?),
        "backup:list" => backup_list(arg0),
        "backup:create" => backup_create(arg0),
        "backup:remove" => backup_remove(arg0, args.get(1).and_then(|v| v.str()).unwrap_or("")),
        "backup:snapshot" => backup_snapshot(arg0),
        "backup:snapshots" => backup_snapshots(arg0),
        "backup:restore-snapshot" => {
            backup_restore_snapshot(shared, arg0, args.get(1).and_then(|v| v.str()).unwrap_or(""))
        }
        "backup:restore" => backup_restore(shared, arg0, args.get(1).and_then(|v| v.str()).unwrap_or("")),
        "ai:export-bundle" => export_bundle(shared, args.first().ok_or("缺少参数")?),
        "net:ping" => {
            let opts = args.first().ok_or("缺少参数")?;
            let host = opts.get("host").and_then(|v| v.str()).unwrap_or("127.0.0.1");
            let port = opts.get("port").and_then(|v| v.num()).unwrap_or(25565.0) as u16;
            let timeout = opts.get("timeoutMs").and_then(|v| v.num()).unwrap_or(1500.0) as u64;
            match ping_server(host, port, timeout) {
                Ok(v) => Ok(v),
                Err(e) => Ok(Json::obj(vec![
                    ("ok", Json::Bool(false)),
                    ("online", Json::Bool(false)),
                    ("error", Json::s(&e)),
                ])),
            }
        }
        "net:probe" => {
            use std::net::ToSocketAddrs;
            let opts = args.first().ok_or("缺少参数")?;
            let host = opts.get("host").and_then(|v| v.str()).unwrap_or("127.0.0.1");
            let port = opts.get("port").and_then(|v| v.num()).unwrap_or(25565.0) as u16;
            let timeout = opts.get("timeoutMs").and_then(|v| v.num()).unwrap_or(800.0) as u64;
            let start = std::time::Instant::now();
            let target = format!("{host}:{port}");
            let ok = target
                .to_socket_addrs()
                .ok()
                .and_then(|mut addrs| addrs.next())
                .map(|addr| {
                    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(timeout)).is_ok()
                })
                .unwrap_or(false);
            Ok(Json::obj(vec![
                ("ok", Json::Bool(ok)),
                ("ms", Json::n(start.elapsed().as_millis() as f64)),
            ]))
        }
        "frp:start" => frp_start(shared, args.first().ok_or("缺少隧道配置")?),
        "frp:stop" => Ok(frp_stop(shared)),
        "frp:status" => Ok(frp_status_live(shared)),
        "versions:minecraft" => versions_minecraft(),
        "versions:fabric-loaders" => fabric_loaders(arg0),
        "versions:server-builds" => {
            let server_type = args.first().and_then(|v| v.str()).unwrap_or("");
            let mc = args.get(1).and_then(|v| v.str()).unwrap_or("");
            if mc.is_empty() {
                Ok(Json::Arr(vec![]))
            } else {
                match server_type {
                    "fabric" => fabric_loaders(mc),
                    "paper" => paper_builds(mc),
                    "purpur" => purpur_builds(mc),
                    _ => Ok(Json::Arr(vec![])),
                }
            }
        }
        "versions:detect-server" => detect_server(arg0),
        "versions:install" => install_server(shared, args.first().ok_or("缺少参数")?),
        "server:preflight" => preflight(shared, arg0),
        "modrinth:search" => modrinth_search(arg0, args.get(1)),
        "modrinth:versions" => modrinth_versions(arg0, args.get(1)),
        "modrinth:install" => modrinth_install(args.first().ok_or("缺少参数")?),
        "mods:scan" => scan_mods(arg0),
        "mods:disable" => toggle_mod(arg0, false),
        "mods:enable" => toggle_mod(arg0, true),
        "mods:meta" => {
            // 单个 jar 的元数据：复用目录扫描，按文件名挑出来
            let p = Path::new(arg0);
            let dir = p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default();
            let file = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let list = scan_mods(&dir)?;
            let hit = list
                .arr()
                .and_then(|arr| arr.iter().find(|m| m.get("file").and_then(|v| v.str()) == Some(file.as_str())).cloned());
            Ok(hit.unwrap_or(Json::Null))
        }
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
        other => Err(format!("UNSUPPORTED:{other}")),
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
    let token = load_or_create_token();
    let path = config_path();
    let config = load_config(&path);

    println!("mcss-agent {} 启动", PRODUCT_VERSION);
    println!("  配置: {}", path.display());
    println!("  监听: http://127.0.0.1:{port}");

    // 被 mcss:// 深链唤起：转成网页地址并打开，然后退出
    let argv: Vec<String> = std::env::args().collect();
    if let Some(pos) = argv.iter().position(|a| a == "--join") {
        if let Some(link) = argv.get(pos + 1) {
            handle_join(link, &token);
            return;
        }
    }

    ensure_protocol();

    let shared: Shared = Arc::new(Mutex::new(State {
        config_path: path,
        config,
        child: None,
        stdin: None,
        status: "stopped".into(),
        subscribers: Vec::new(),
        token,
        frp: None,
        frp_logs: Vec::new(),
        frp_address: String::new(),
        frp_error: String::new(),
        frp_pending: false,
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


/* ============================ 下载行为契约 ============================ */
// 与 electron/ipc/download.test.ts 一一对应（见 docs/DOWNLOAD-CONTRACT.md）：
//   [fresh] 正常下载并通过哈希校验
//   [resume] 有 .part 时用 Range 续传
//   [norange] 服务端不支持 Range 时从头重下
//   [bad-hash] 校验不过时换下一个源
//   [all-fail] 全部失败时不留半成品
#[cfg(test)]
mod download_contract {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    fn body() -> Vec<u8> {
        vec![7u8; 64 * 1024]
    }

    struct Server {
        port: u16,
        hits: Arc<AtomicUsize>,
        saw_range: Arc<AtomicBool>,
        _handle: std::thread::JoinHandle<()>,
    }

    /// mode: "range" | "norange" | "bad" | "fail"
    fn serve(mode: &'static str) -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let hits = Arc::new(AtomicUsize::new(0));
        let saw_range = Arc::new(AtomicBool::new(false));
        let hits2 = Arc::clone(&hits);
        let range2 = Arc::clone(&saw_range);

        let handle = std::thread::spawn(move || {
            let payload = body();
            for _ in 0..8 {
                let Ok((mut stream, _)) = listener.accept() else { break };
                let mut buf = [0u8; 2048];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                hits2.fetch_add(1, Ordering::SeqCst);

                let lower = req.to_lowercase();
                let start = lower.find("range: bytes=").map(|i| {
                    let rest = &lower[i + "range: bytes=".len()..];
                    rest.split('-').next().unwrap_or("0").trim().parse::<usize>().unwrap_or(0)
                });
                if start.is_some() {
                    range2.store(true, Ordering::SeqCst);
                }

                let (status, data, content_range): (&str, Vec<u8>, Option<String>) = match mode {
                    "range" => match start {
                        Some(offset) if offset < payload.len() => (
                            "206 Partial Content",
                            payload[offset..].to_vec(),
                            // curl 续传需要 Content-Range，否则会认为响应不完整
                            Some(format!("bytes {}-{}/{}", offset, payload.len() - 1, payload.len())),
                        ),
                        _ => ("200 OK", payload.clone(), None),
                    },
                    "norange" => ("200 OK", payload.clone(), None),
                    "bad" => ("200 OK", vec![9u8; payload.len()], None),
                    _ => ("500 Internal Server Error", b"nope".to_vec(), None),
                };

                let mut head = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n",
                    data.len()
                );
                if let Some(range) = content_range {
                    head.push_str(&format!("Content-Range: {range}\r\n"));
                }
                head.push_str("\r\n");
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&data);
            }
        });

        Server { port, hits, saw_range, _handle: handle }
    }

    fn tmp_dest() -> PathBuf {
        // cargo test 并行跑用例：只按秒命名会让多个用例共用同一个目录，互相删文件
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("mcss-dl-{}-{}-{}", std::process::id(), now_stamp(), n));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("file.bin")
    }

    #[test]
    fn fresh() {
        let server = serve("range");
        let dest = tmp_dest();
        let expected = sha1::sha1_hex(&body());
        let size = download_to(&format!("http://127.0.0.1:{}/f", server.port), &dest, &[], Some(&expected)).unwrap();
        assert_eq!(size as usize, body().len());
        assert_eq!(sha1::sha1_hex(&std::fs::read(&dest).unwrap()), expected);
        let _ = std::fs::remove_dir_all(dest.parent().unwrap());
    }

    #[test]
    fn resume() {
        let server = serve("range");
        let dest = tmp_dest();
        let half = body().len() / 2;
        std::fs::write(dest.with_extension("bin.part"), &body()[..half]).unwrap();
        let expected = sha1::sha1_hex(&body());
        download_to(&format!("http://127.0.0.1:{}/f", server.port), &dest, &[], Some(&expected)).unwrap();
        assert!(server.saw_range.load(Ordering::SeqCst), "应带 Range 头");
        assert_eq!(std::fs::read(&dest).unwrap().len(), body().len());
        let _ = std::fs::remove_dir_all(dest.parent().unwrap());
    }

    #[test]
    fn supports_no_range() {
        let server = serve("norange");
        let dest = tmp_dest();
        std::fs::write(dest.with_extension("bin.part"), vec![0u8; 1024]).unwrap();
        let expected = sha1::sha1_hex(&body());
        download_to(&format!("http://127.0.0.1:{}/f", server.port), &dest, &[], Some(&expected)).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap().len(), body().len());
        let _ = std::fs::remove_dir_all(dest.parent().unwrap());
    }

    #[test]
    fn bad_hash() {
        let bad = serve("bad");
        let good = serve("range");
        let dest = tmp_dest();
        let expected = sha1::sha1_hex(&body());
        let mirrors = vec![
            format!("http://127.0.0.1:{}/", bad.port),
            format!("http://127.0.0.1:{}/", good.port),
        ];
        download_to("f", &dest, &mirrors, Some(&expected)).unwrap();
        assert_eq!(sha1::sha1_hex(&std::fs::read(&dest).unwrap()), expected);
        assert!(bad.hits.load(Ordering::SeqCst) >= 1);
        assert!(good.hits.load(Ordering::SeqCst) >= 1);
        let _ = std::fs::remove_dir_all(dest.parent().unwrap());
    }

    #[test]
    fn all_fail() {
        let server = serve("fail");
        let dest = tmp_dest();
        let result = download_to(&format!("http://127.0.0.1:{}/f", server.port), &dest, &[], None);
        assert!(result.is_err(), "应报错");
        assert!(!dest.exists(), "目标路径不应留下半成品");
        let _ = std::fs::remove_dir_all(dest.parent().unwrap());
    }
}
