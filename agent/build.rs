//! 让 agent 的版本号跟着 package.json 走，避免三处（package.json / 包目录 / agent）各说各话。
//! 编译时读一次，写进 MCSS_VERSION 环境变量，main.rs 用 env! 取。

use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=../package.json");

    let mut version = String::from("0.1.0");
    if let Ok(text) = std::fs::read_to_string("../package.json") {
        // 只取顶层 "version"：找第一个 "version" 字段即可，避免引 JSON 解析依赖
        if let Some(idx) = text.find("\"version\"") {
            let rest = &text[idx + "\"version\"".len()..];
            if let Some(colon) = rest.find(':') {
                let after = &rest[colon + 1..];
                if let Some(start) = after.find('"') {
                    if let Some(end) = after[start + 1..].find('"') {
                        let candidate = &after[start + 1..start + 1 + end];
                        if !candidate.is_empty() && candidate.chars().all(|c| c.is_ascii_digit() || c == '.') {
                            version = candidate.to_string();
                        }
                    }
                }
            }
        }
    }

    println!("cargo:rustc-env=MCSS_VERSION={version}");

    // 记一下源码目录，方便排查「为什么版本没更新」
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    println!("cargo:rustc-env=MCSS_AGENT_DIR={}", manifest.display());
}
