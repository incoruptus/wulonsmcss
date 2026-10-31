#!/usr/bin/env python3
"""把《文案优化稿》安全回填到源码。

用法：
    python scripts/apply-copy-doc.py --dry-run
    python scripts/apply-copy-doc.py --write

原则：
- 不按稿中的「序号」直接改源码，序号对应旧清单，已错位。
- 以「原文」做规范化匹配，在 xlsx 里找到候选 file/line。
- 普通字符串、模板字符串、JSX 文本分别按原文 / 占位符骨架匹配。
- 模板里的 ${…} 会保留原始表达式；新文案只替换字面量。
- 5.2 节列出的 20 个片段默认跳过，留给源码层合并。
- 370（Kimi 感谢）和 1769（许可段落）已与当前界面不符，跳过。
"""

from __future__ import annotations

import argparse
import glob
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DOC = Path(r"D:\Users\Nike2\Documents\deepseek-harness\default-workspace\文案优化稿-2026-10-31.md")
SKIP_NOS = {370, 1769}
PLACEHOLDER = "${…}"


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_table_rows(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 4 or not re.fullmatch(r"\d+", cells[0]):
            continue
        rows.append({"no": int(cells[0]), "old": cells[1], "new": cells[2], "note": cells[3]})
    return rows


def parse_long_texts(text: str) -> dict[int, dict]:
    pattern = re.compile(
        r"### 3\.\d+ 序号 (\d+)（[^）]*）.*?\*\*原文\*\*\s*```text\n(.*?)\n```\s*\*\*新文案\*\*\s*```text\n(.*?)\n```",
        re.S,
    )
    out = {}
    for m in pattern.finditer(text):
        out[int(m.group(1))] = {"old": m.group(2), "new": m.group(3)}
    return out


def parse_5_2(text: str) -> set[int]:
    section = text.split("### 5.2", 1)[1].split("### 5.3", 1)[0]
    out = set()
    for line in section.splitlines():
        m = re.match(r"\|\s*(\d+)\s*\|", line)
        if m:
            out.add(int(m.group(1)))
    return out


def load_xlsx() -> tuple[dict[int, dict], dict[str, list[dict]]]:
    path = glob.glob(str(ROOT / "docs" / "文案清单-*.xlsx"))[-1]
    wb = openpyxl.load_workbook(path)
    ws = wb["全部文案"]
    by_no: dict[int, dict] = {}
    by_text: dict[str, list[dict]] = defaultdict(list)
    for r in range(2, ws.max_row + 1):
        no = r - 1
        text = ws.cell(r, 7).value or ""
        item = {
            "no": no,
            "module": ws.cell(r, 2).value,
            "file": ws.cell(r, 4).value,
            "line": ws.cell(r, 5).value,
            "kind": ws.cell(r, 6).value,
            "text": text,
        }
        by_no[no] = item
        by_text[norm(text)].append(item)
    return by_no, by_text


def variants(text: str) -> list[str]:
    """原文在源码里可能被转义：双引号/单引号/反引号/换行。"""
    out = {text}
    for a, b in (('"', '\\"'), ("'", "\\'"), ("`", "\\`")):
        out |= {x.replace(a, b) for x in list(out)}
    out |= {x.replace("\n", "\\n") for x in list(out)}
    return list(out)


def skeleton_regex(old: str) -> re.Pattern:
    """把 ${…} 当占位符，其余按字面量；空白按 \\s+ 放宽。"""
    parts = old.split(PLACEHOLDER)
    chunks = []
    for part in parts:
        esc = re.escape(part)
        esc = esc.replace(r"\ ", r"\s+")
        esc = esc.replace(r"\n", r"\s+")
        chunks.append(esc)
    body = r"(\$\{(?:[^{}]|\{[^{}]*\})*\})".join(chunks)
    return re.compile(body, re.S)


def choose_match(content: str, old: str, target_line: int, long_text: bool) -> tuple[int, int, re.Match | None] | None:
    tolerance = 12 if long_text else 4
    candidates: list[tuple[int, int, re.Match | None]] = []
    for v in variants(old):
        start = 0
        while True:
            pos = content.find(v, start)
            if pos < 0:
                break
            line = content.count("\n", 0, pos) + 1
            if abs(line - target_line) <= tolerance:
                candidates.append((pos, pos + len(v), None))
            start = pos + 1
    if not candidates:
        regex = skeleton_regex(old)
        for m in regex.finditer(content):
            line = content.count("\n", 0, m.start()) + 1
            if abs(line - target_line) <= tolerance:
                candidates.append((m.start(), m.end(), m))
    if not candidates:
        return None
    # 取离目标行最近、且优先长匹配（避免短片段误命中）
    candidates.sort(key=lambda x: (abs(content.count("\n", 0, x[0]) + 1 - target_line), -(x[1] - x[0])))
    return candidates[0]


def quote_at(content: str, start: int) -> str:
    """判断匹配位置属于哪种字面量；不是字符串则返回空串。"""
    i = start - 1
    while i >= 0 and content[i] in " \t":
        i -= 1
    if i >= 0 and content[i] in ('"', "'", "`"):
        # 前一个字符是转义符就说明它是内容里的引号，不是外层
        if i == 0 or content[i - 1] != "\\":
            return content[i]
    return ""


def escape_for(text: str, quote: str) -> str:
    if quote == '"':
        return text.replace("\\", "\\\\").replace('"', '\\"')
    if quote == "'":
        return text.replace("\\", "\\\\").replace("'", "\\'")
    if quote == "`":
        return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return text


def build_replacement(old: str, new: str, m: re.Match | None, quote: str) -> str | None:
    if PLACEHOLDER in old:
        captures = list(m.groups()) if m else []
        parts = new.split(PLACEHOLDER)
        if len(parts) != len(captures) + 1:
            return None
        out = [parts[0]]
        for i, cap in enumerate(captures):
            out.append(cap)
            out.append(parts[i + 1])
        return "".join(out)
    if PLACEHOLDER in new:
        return None
    return escape_for(new, quote)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc", default=str(DEFAULT_DOC))
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report", default=str(ROOT / "docs" / "copy-apply-report.json"))
    args = parser.parse_args()

    doc = Path(args.doc).read_text("utf-8")
    changes = parse_table_rows(doc)
    long_texts = parse_long_texts(doc)
    fragments = parse_5_2(doc)
    _, by_text = load_xlsx()

    edits_by_file: dict[str, list[dict]] = defaultdict(list)
    report = {"applied": [], "skipped": [], "conflicts": []}

    for change in changes:
        no = change["no"]
        if no in SKIP_NOS:
            report["skipped"].append({"no": no, "reason": "已删除/结构已变"})
            continue
        if no in fragments:
            report["skipped"].append({"no": no, "reason": "5.2 片段，需源码层合并"})
            continue
        old = change["old"]
        new = change["new"]
        if no in long_texts:
            old = long_texts[no]["old"]
            new = long_texts[no]["new"]
        if norm(old) in ("见第 3 节",):
            report["skipped"].append({"no": no, "reason": "长文本未解析"})
            continue

        candidates = by_text.get(norm(old), [])
        if not candidates:
            report["skipped"].append({"no": no, "reason": "xlsx 里找不到原文", "old": old[:120]})
            continue

        for cand in candidates:
            path = ROOT / cand["file"]
            if not path.exists():
                report["skipped"].append({"no": no, "reason": "文件不存在", "file": cand["file"]})
                continue
            content = path.read_text("utf-8")
            found = choose_match(content, old, cand["line"], no in long_texts)
            if not found:
                report["skipped"].append({"no": no, "reason": "源码里找不到匹配", "file": cand["file"], "line": cand["line"]})
                continue
            start, end, m = found
            quote = quote_at(content, start)
            replacement = build_replacement(old, new, m, quote)
            if replacement is None:
                report["skipped"].append({"no": no, "reason": "占位符数量不一致或引号上下文不安全", "file": cand["file"], "line": cand["line"]})
                continue
            if quote == "" and any(ch in replacement for ch in "<{}>"):
                report["skipped"].append({"no": no, "reason": "JSX 文本含需转义字符", "file": cand["file"], "line": cand["line"]})
                continue
            edits_by_file[str(path)].append(
                {
                    "no": no,
                    "start": start,
                    "end": end,
                    "new": replacement,
                    "old": old,
                    "file": cand["file"],
                    "line": content.count("\n", 0, start) + 1,
                }
            )

    for file, edits in edits_by_file.items():
        # 同一段源码可能被两条「同义但占位符写法不同」的条目命中（如 {mc} 与 ${…}）。
        # 重叠时优先保留使用 ${…} 的那条，其余记为跳过，避免两条新文案互相覆盖。
        edits.sort(key=lambda e: (e["start"], e["end"]))
        groups: list[list[dict]] = []
        for e in edits:
            if groups and e["start"] < max(x["end"] for x in groups[-1]):
                groups[-1].append(e)
            else:
                groups.append([e])
        final = []
        for group in groups:
            if len(group) == 1:
                final.append(group[0])
                continue
            group.sort(key=lambda e: (PLACEHOLDER in e["old"], len(e["new"])), reverse=True)
            keep = group[0]
            final.append(keep)
            for dropped in group[1:]:
                report["skipped"].append(
                    {
                        "no": dropped["no"],
                        "reason": "与同义条目重叠，保留更完整的一条",
                        "file": dropped["file"],
                        "line": dropped["line"],
                    }
                )
        edits_by_file[file] = final

    if args.write:
        for file, edits in edits_by_file.items():
            path = Path(file)
            content = path.read_text("utf-8")
            for e in sorted(edits, key=lambda x: x["start"], reverse=True):
                content = content[: e["start"]] + e["new"] + content[e["end"] :]
            path.write_text(content, "utf-8")

    for file, edits in edits_by_file.items():
        for e in edits:
            report["applied"].append({"no": e["no"], "file": e["file"], "line": e["line"]})

    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    print(f"{'写入' if args.write else '演练'}：{len(report['applied'])} 处，跳过 {len(report['skipped'])}，冲突 {len(report['conflicts'])}")
    if report["skipped"]:
        reasons = Counter(s["reason"] for s in report["skipped"])
        for reason, count in reasons.most_common():
            print(f"  - {reason}: {count}")


if __name__ == "__main__":
    main()
