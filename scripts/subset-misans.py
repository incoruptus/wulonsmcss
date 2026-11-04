"""MiSans VF 子集化。

完整 MiSans VF 是 11.9MB、29,571 字形。网页版把这个体积塞进首屏不划算，
所以按 GB2312 字符集（6,763 个汉字）加 ASCII、中文标点和常用符号切一份
子集，桌面版和网页版共用同一份文件，避免两端字体不一致。

超出子集的生僻字会逐字回退到系统黑体——只有用户自己输入的名字、Mod 名
可能触发，固定 UI 文案不会。完整字体仍留在 assets/fonts 里，需要时可以
换回去。

    python scripts/subset-misans.py
"""

from __future__ import annotations

import io
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "renderer" / "assets" / "fonts" / "misans-vf.woff2"
OUT = ROOT / "src" / "renderer" / "assets" / "fonts" / "misans-vf-subset.woff2"


def charset() -> str:
    chars: set[str] = set()

    # ASCII 可打印字符
    chars.update(chr(c) for c in range(0x20, 0x7F))

    # GB2312 全部符号区与汉字区
    for high in range(0xA1, 0xF8):
        for low in range(0xA1, 0xFF):
            try:
                chars.add(bytes([high, low]).decode("gb2312"))
            except UnicodeDecodeError:
                continue

    # 常用全角标点、破折号、省略号、间隔号
    chars.update("　、。〃々〈〉《》「」『』【】〔〕〖〗〘〙〚〛〜〝〞〟〰〾〿")
    chars.update("–—‘’‛“”„‟…‧﹏")
    chars.update("·×÷±°№§¶†‡•‰′″€£¥¢")

    return "".join(sorted(chars))


def main() -> int:
    if not SRC.exists():
        print(f"missing source font: {SRC}", file=sys.stderr)
        return 1

    text = charset()
    print(f"glyph source text: {len(text)} characters")

    text_file = ROOT / "scripts" / ".misans-chars.txt"
    text_file.write_text(text, encoding="utf-8")

    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(SRC),
        f"--text-file={text_file}",
        "--flavor=woff2",
        f"--output-file={OUT}",
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
        "--recalc-bounds",
        "--retain-gids",
        "--name-IDs=*",
    ]
    subprocess.run(cmd, check=True)
    text_file.unlink(missing_ok=True)

    before = SRC.stat().st_size
    after = OUT.stat().st_size
    print(f"{before / 1e6:.1f}MB -> {after / 1e6:.1f}MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
