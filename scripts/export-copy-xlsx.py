#!/usr/bin/env python3
"""导出渲染层 / 主进程 / 本地助手的用户可见中文文案到 xlsx。

用法：
    python scripts/export-copy-xlsx.py

输出：
    docs/文案清单-YYYY-MM-DD.xlsx

范围：
- src/renderer/**/*.ts,tsx（跳过测试与 assets）
- electron/**/*.js,ts（跳过测试）
- agent/src/**/*.rs

不包含：README、docs、构建脚本、测试断言。
提取方式：去注释 → 抓字符串字面量与 JSX 文本 → 过滤纯代码/日志 → 按文件+行号去重。
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / f"文案清单-{date.today().isoformat()}.xlsx"

CJK = re.compile(r"[\u4e00-\u9fff]")
JSX_TEXT = re.compile(r">([^<>{}]*[\u4e00-\u9fff][^<>{}]*)<", re.S)
TEMPLATE_LITERAL = re.compile(r"`(?:\\.|[^`\\])*`", re.S)

SOURCES = [
    ("界面", ROOT / "src" / "renderer", (".ts", ".tsx")),
    ("主进程", ROOT / "electron", (".js", ".ts")),
    ("本地助手", ROOT / "agent" / "src", (".rs",)),
]

ESCAPES = {"n": "\n", "r": "", "t": " ", '"': '"', "'": "'", "\\": "\\", "`": "`", "0": ""}
CODE_MARKERS = ("function ", "return ", "const ", "let ", "var ", " =>", "?.", "new Date", "lines.push", "console.", ");", "||", "/*", "*/", "fn ", "->")


def _read_escape(text: str, i: int) -> tuple[str, int]:
    """i 指向反斜杠；返回解码后的字符与新位置。"""
    if i + 1 >= len(text):
        return "", i + 1
    c = text[i + 1]
    if c == "u" and i + 5 < len(text):
        try:
            return chr(int(text[i + 2 : i + 6], 16)), i + 6
        except ValueError:
            return "", i + 2
    if c == "x" and i + 3 < len(text):
        try:
            return chr(int(text[i + 2 : i + 4], 16)), i + 4
        except ValueError:
            return "", i + 2
    return ESCAPES.get(c, c), i + 2


def _read_string(text: str, i: int, quote: str, line: int) -> tuple[str, int, int]:
    i += 1
    buf: list[str] = []
    while i < len(text):
        c = text[i]
        if c == "\\":
            ch, i = _read_escape(text, i)
            buf.append(ch)
            continue
        if c == quote:
            return "".join(buf), i + 1, line
        if c == "\n":
            line += 1
        buf.append(c)
        i += 1
    return "".join(buf), i, line


def _skip_expr(text: str, i: int, line: int) -> tuple[int, int]:
    """i 指向 ${ 后面的第一个字符；跳到匹配的 } 之后。"""
    depth = 1
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                if text[i] == "\n":
                    line += 1
                i += 1
            i += 2
        elif c in ('"', "'"):
            _, i, line = _read_string(text, i, c, line)
        elif c == "`":
            _, i, line = _read_template(text, i, line)
        elif c == "{":
            depth += 1
            i += 1
        elif c == "}":
            depth -= 1
            i += 1
            if depth == 0:
                return i, line
        else:
            i += 1
    return i, line


def _read_template(text: str, i: int, line: int) -> tuple[str, int, int]:
    i += 1
    buf: list[str] = []
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            ch, i = _read_escape(text, i)
            buf.append(ch)
            continue
        if c == "`":
            return "".join(buf), i + 1, line
        if c == "$" and i + 1 < n and text[i + 1] == "{":
            buf.append("${…}")
            i, line = _skip_expr(text, i + 2, line)
            continue
        if c == "\n":
            line += 1
        buf.append(c)
        i += 1
    return "".join(buf), i, line


def extract_strings(text: str, rust: bool) -> list[tuple[str, int]]:
    hits: list[tuple[str, int]] = []
    i = 0
    line = 1
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\n":
            line += 1
            i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                if text[i] == "\n":
                    line += 1
                i += 1
            i += 2
        elif c == '"':
            start = line
            value, i, line = _read_string(text, i, '"', line)
            hits.append((value, start))
        elif c == "'" and not rust:
            start = line
            value, i, line = _read_string(text, i, "'", line)
            hits.append((value, start))
        elif c == "`" and not rust:
            start = line
            value, i, line = _read_template(text, i, line)
            hits.append((value, start))
        else:
            i += 1
    return hits


def normalize(value: str) -> str:
    value = re.sub(r"[ \t]+", " ", value)
    if len(value) > 200:
        # 长模板（如 AI 现场包说明）保留段落，方便直接改
        value = re.sub(r"\n{3,}", "\n\n", value)
        return value.strip()
    return re.sub(r"\s+", " ", value).strip()


def row_height(text: str) -> int:
    lines = text.count("\n") + 1
    return min(132, max(30, 15 * lines + 8))


def module_of(rel: str) -> str:
    p = rel.replace("\\", "/")
    if "/pages/" in p:
        name = p.split("/pages/")[1].split("/")[0].rsplit(".", 1)[0]
        return f"页面 · {name}"
    if "/components/instance/" in p:
        name = p.split("/components/instance/")[1].rsplit(".", 1)[0]
        return f"实例 · {name}"
    if "/components/app/" in p:
        name = p.split("/components/app/")[1].rsplit(".", 1)[0]
        return f"应用壳 · {name}"
    if "/components/ui/" in p:
        name = p.split("/components/ui/")[1].rsplit(".", 1)[0]
        return f"基础组件 · {name}"
    if "/components/" in p:
        name = p.split("/components/")[1].rsplit(".", 1)[0]
        return f"组件 · {name}"
    if "/lib/" in p:
        name = p.split("/lib/")[1].rsplit(".", 1)[0]
        return f"逻辑 · {name}"
    if "/stores/" in p:
        name = p.split("/stores/")[1].rsplit(".", 1)[0]
        return f"状态 · {name}"
    if "electron/ipc/" in p:
        name = p.split("electron/ipc/")[1].rsplit(".", 1)[0]
        return f"主进程 · {name}"
    if p.startswith("electron/"):
        return "主进程 · 入口"
    if p.startswith("agent/"):
        return "本地助手"
    return "其他"


def kind_of(line: str, jsx: bool) -> str:
    if "toast." in line:
        return "提示"
    if "throw new Error" in line or "new Error(" in line or "error:" in line or "Err(" in line:
        return "错误"
    if "aria-label" in line or "placeholder=" in line or "title=" in line:
        return "可访问/占位"
    if jsx:
        return "界面文本"
    return "字符串"


rows: list[dict] = []
seen: set[tuple[str, int, str]] = set()

for source, base, exts in SOURCES:
    if not base.exists():
        continue
    for path in sorted(base.rglob("*")):
        if path.suffix not in exts or not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if ".test." in rel or "/assets/" in rel or "node_modules" in rel:
            continue
        if path.stat().st_size > 900_000:
            continue
        original = path.read_text("utf-8", errors="replace")
        lines = original.splitlines()
        module = module_of(rel)
        rust = path.suffix == ".rs"
        jsx = path.suffix in (".tsx", ".jsx")
        # 去注释但保留行号：模板/JSX 的二次提取用这份
        clean = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), original, flags=re.S)
        clean = re.sub(r"(?m)^\s*//.*$", "", clean)

        def add(value: str, line_no: int, is_jsx: bool) -> None:
            value = normalize(value)
            if not value or not CJK.search(value):
                return
            if len(value) < 2 or len(value) > 2000:
                return
            if any(marker in value for marker in CODE_MARKERS):
                return
            if value.startswith((");", "}", "]", ">", "<")):
                return
            line = lines[line_no - 1] if 0 < line_no <= len(lines) else ""
            if "console." in line:
                return
            key = (rel, line_no, value)
            if key in seen:
                return
            seen.add(key)
            rows.append(
                {
                    "module": module,
                    "source": source,
                    "file": rel,
                    "line": line_no,
                    "kind": kind_of(line, is_jsx),
                    "text": value,
                }
            )

        for value, line_no in extract_strings(original, rust):
            add(value, line_no, False)

        # 模板字符串兜底：词法器在嵌套 ${…} 上偶尔会切碎，这里按反引号整段再抓一次，
        # 只保留字面量文本（${…} 统一替换成占位符），避免把表达式代码带进清单。
        if not rust:
            for match in TEMPLATE_LITERAL.finditer(clean):
                body = match.group(0)[1:-1].replace("\\`", "`")
                body = re.sub(r"\$\{[^{}]*\}", "${…}", body)
                line_no = clean.count("\n", 0, match.start()) + 1
                add(body, line_no, False)

        if jsx:
            # JSX 文本直接在去注释后的源码上抓；表达式里的字符串已由词法器单独提取，
            # 这里只补标签之间的可见文本，避免 strip_jsx_braces 在多行表达式上误吞后续文本。
            for match in JSX_TEXT.finditer(clean):
                line_no = clean.count("\n", 0, match.start()) + 1
                add(match.group(1), line_no, True)

rows.sort(key=lambda r: (r["module"], r["file"], r["line"], r["text"]))
texts = defaultdict(list)
for row in rows:
    texts[row["text"]].append(row)

wb = Workbook()

# ---------------- 使用说明 ----------------
ws = wb.active
ws.title = "使用说明"
ws.sheet_view.showGridLines = False
ws.column_dimensions["A"].width = 3
ws.column_dimensions["B"].width = 22
ws.column_dimensions["C"].width = 96

title_font = Font(name="Microsoft YaHei", size=20, bold=True, color="171717")
h2_font = Font(name="Microsoft YaHei", size=12, bold=True, color="171717")
body_font = Font(name="Microsoft YaHei", size=10, color="333333")
muted_font = Font(name="Microsoft YaHei", size=10, color="666666")

ws["B2"] = "Wulon's MCSS · 文案清单"
ws["B2"].font = title_font
ws["B3"] = f"导出于 {date.today().isoformat()} · 共 {len(rows)} 条（去重 {len(texts)} 条）"
ws["B3"].font = muted_font

notes = [
    ("范围", "渲染层 UI（含桌面/网页共用的同一套）、Electron 主进程提示、Rust 本地助手提示。"),
    ("不含", "README、docs、构建脚本、测试断言、第三方 API 返回内容。"),
    ("怎么改", "在「全部文案」或「去重文案」的「新文案」列直接改；备注列写原因/上下文。"),
    ("重复项", "同一句话可能在多处出现；「去重文案」按原文聚合，改之前先看出现位置。"),
    ("模板", "含 ${...} 的模板请保留占位符；含 {0}/{1} 的同样保留。"),
    ("术语", "「术语表」是当前统一口径，改文案时优先跟它一致；要改术语请整表替换。"),
    ("行号", "行号对应导出时的源码；改完源码后重新跑 scripts/export-copy-xlsx.py 可刷新。"),
]
r = 5
for label, value in notes:
    ws.cell(r, 2, label).font = h2_font
    ws.cell(r, 3, value).font = body_font
    ws.cell(r, 3).alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[r].height = 34
    r += 1

# ---------------- 全部文案 ----------------
ws = wb.create_sheet("全部文案")
headers = ["序号", "模块", "来源", "文件", "行号", "类型", "原文", "新文案", "备注"]
widths = [6, 26, 10, 46, 7, 14, 80, 52, 32]
for i, (h, w) in enumerate(zip(headers, widths), 1):
    cell = ws.cell(1, i, h)
    cell.font = Font(name="Microsoft YaHei", size=10, bold=True, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor="171717")
    cell.alignment = Alignment(vertical="center", horizontal="center")
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 24
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:I{len(rows) + 1}"

edit_fill = PatternFill("solid", fgColor="FFF8E1")
border = Border(bottom=Side(style="hair", color="E5E5E5"))
for index, row in enumerate(rows, 1):
    values = [index, row["module"], row["source"], row["file"], row["line"], row["kind"], row["text"], "", ""]
    for col, value in enumerate(values, 1):
        cell = ws.cell(index + 1, col, value)
        cell.font = Font(name="Microsoft YaHei", size=10, color="222222")
        cell.alignment = Alignment(vertical="top", wrap_text=col in (7, 8, 9))
        cell.border = border
        if col in (8, 9):
            cell.fill = edit_fill
    ws.row_dimensions[index + 1].height = row_height(row["text"])

# ---------------- 去重文案 ----------------
ws = wb.create_sheet("去重文案")
headers = ["序号", "原文", "次数", "类型", "出现位置（最多 5 处）", "新文案", "备注"]
widths = [6, 90, 7, 14, 70, 52, 32]
for i, (h, w) in enumerate(zip(headers, widths), 1):
    cell = ws.cell(1, i, h)
    cell.font = Font(name="Microsoft YaHei", size=10, bold=True, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor="171717")
    cell.alignment = Alignment(vertical="center", horizontal="center")
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[1].height = 24
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:G{len(texts) + 1}"

for index, (text, items) in enumerate(sorted(texts.items(), key=lambda kv: (-len(kv[1]), kv[0])), 1):
    places = "；".join(f'{x["file"]}:{x["line"]}' for x in items[:5])
    values = [index, text, len(items), items[0]["kind"], places, "", ""]
    for col, value in enumerate(values, 1):
        cell = ws.cell(index + 1, col, value)
        cell.font = Font(name="Microsoft YaHei", size=10, color="222222")
        cell.alignment = Alignment(vertical="top", wrap_text=col in (2, 5, 6, 7))
        cell.border = border
        if col in (6, 7):
            cell.fill = edit_fill
    ws.row_dimensions[index + 1].height = row_height(text)

# ---------------- 术语表 ----------------
ws = wb.create_sheet("术语表")
headers = ["序号", "术语（英文/内部）", "当前中文", "说明 / 建议"]
widths = [6, 24, 24, 90]
for i, (h, w) in enumerate(zip(headers, widths), 1):
    cell = ws.cell(1, i, h)
    cell.font = Font(name="Microsoft YaHei", size=10, bold=True, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor="171717")
    cell.alignment = Alignment(vertical="center", horizontal="center")
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "A2"

terms = [
    ("Instance", "服务器", "产品主对象；仅在房间码语境保留“房间”。"),
    ("Overview", "总览", "全局/实例页都叫总览，不再用“概览”。"),
    ("Server core / serverType", "服务端核心", "Paper / Purpur / Fabric / Forge / NeoForge / 原版。"),
    ("Loader", "加载器", "Fabric/Forge/NeoForge 的版本。"),
    ("Mod", "模组", "菜单里叫“模组”，不用“Mod”混排；房间语境可保留 Mod。"),
    ("Plugin", "插件", "Paper/Purpur 用。"),
    ("Datapack", "数据包", "原版/数据包服。"),
    ("Preflight", "开服前预检", "启动前的 Java/端口/EULA/内存/磁盘检查。"),
    ("Reachability", "联机状态", "玩家视角叫“朋友能不能进来”。"),
    ("Tunnel", "隧道", "FRP/樱花穿透。"),
    ("Port mapping", "端口映射", "UPnP 一键映射。"),
    ("Room code", "房间码", "自包含邀请码。"),
    ("Join pack", "进服包", ".mrpack。"),
    ("Backup", "备份", "整包 zip。"),
    ("Snapshot", "时间机快照", "增量快照。"),
    ("Whitelist", "白名单", "服务器白名单。"),
    ("OP", "管理员", "游戏内 OP。"),
    ("Host / Player", "服主 / 玩家", "两种使用方式。"),
    ("Client", "客户端", "玩家侧 .minecraft。"),
    ("Launcher", "启动器", "PCL2/HMCL/官方等。"),
    ("Palette", "茶色", "五套主题；明暗单独叫“明暗”。"),
    ("Diagnostic code", "诊断码", "玩家失败后生成给服主的一段码。"),
    ("MOTD", "MOTD", "服务器列表里的欢迎语，不强行翻译。"),
    ("TPS", "TPS", "不翻译；低于 15 才提示“需要关注”。"),
]
for index, (en, zh, note) in enumerate(terms, 1):
    for col, value in enumerate([index, en, zh, note], 1):
        cell = ws.cell(index + 1, col, value)
        cell.font = Font(name="Microsoft YaHei", size=10, color="222222")
        cell.alignment = Alignment(vertical="top", wrap_text=col == 4)
        cell.border = border
    ws.row_dimensions[index + 1].height = 28

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f"写入 {OUT}")
print(f"全部文案 {len(rows)} 条，去重 {len(texts)} 条")
