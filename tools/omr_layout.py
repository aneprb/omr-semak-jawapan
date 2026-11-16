"""Port rujukan Python bagi build_layout (docs/PLAN.md 4.1).

Penggunaan:
    python tools/omr_layout.py --golden tests/fixtures/layouts
    python tools/omr_layout.py --config 40 5 4      # cetak satu susun atur
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

LAYOUT_VERSION = 1
PAGE_W, PAGE_H = 210, 297
GOLDEN_CONFIGS = [(10, 4, 0), (20, 5, 4), (40, 5, 6), (60, 4, 2)]


class LayoutError(ValueError):
    code = "LAYOUT_INVALID"


def r2(v: float) -> float:
    """Bundar ke 0.01 mm; hasil integer dikembalikan sebagai int."""
    out = round(v * 100) / 100
    return int(out) if out == int(out) else out


def validate_layout_config(config: dict) -> tuple[bool, list[str]]:
    errors: list[str] = []
    n = config.get("numQuestions")
    c = config.get("numChoices")
    d = config.get("idDigits")
    if not isinstance(n, int) or isinstance(n, bool) or not 10 <= n <= 60:
        errors.append("numQuestions mesti integer 10..60")
    if c not in (4, 5) or isinstance(c, bool):
        errors.append("numChoices mesti 4 atau 5")
    if not isinstance(d, int) or isinstance(d, bool) or not 0 <= d <= 6:
        errors.append("idDigits mesti integer 0..6")
    return (not errors, errors)


def layout_code(config: dict) -> str:
    return f"Q{config['numQuestions']}-C{config['numChoices']}-ID{config['idDigits']}"


def build_layout(config: dict) -> dict:
    ok, errors = validate_layout_config(config)
    if not ok:
        raise LayoutError("; ".join(errors))
    n, nc, nd = config["numQuestions"], config["numChoices"], config["idDigits"]
    letters = ["A", "B", "C", "D", "E"][:nc]
    cols = math.ceil(n / 20)

    questions = []
    for q in range(1, n + 1):
        col = (q - 1) // 20
        row = (q - 1) % 20
        col_x = 22 + col * 58
        cy = 100 + row * 8
        questions.append(
            {
                "q": q,
                "col": col,
                "row": row,
                "labelX": r2(col_x),
                "labelY": r2(cy),
                "bubbles": [
                    {"choice": letters[k], "cx": r2(col_x + 12 + k * 7), "cy": r2(cy), "r": 2.5}
                    for k in range(nc)
                ],
            }
        )

    choice_headers = [
        {"col": col, "choice": letters[k], "x": r2(22 + col * 58 + 12 + k * 7), "y": 93}
        for col in range(cols)
        for k in range(nc)
    ]

    id_block = None
    if nd > 0:
        id_block = {
            "label": {"x": 141, "y": 24},
            "writeBoxes": [{"x": r2(141.5 + j * 7), "y": 27, "w": 5, "h": 6} for j in range(nd)],
            "digits": [
                {
                    "index": j,
                    "bubbles": [
                        {"digit": d, "cx": r2(144 + j * 7), "cy": r2(38 + d * 5.5), "r": 2.1}
                        for d in range(10)
                    ],
                }
                for j in range(nd)
            ],
        }

    return {
        "schema": "omr-layout",
        "version": LAYOUT_VERSION,
        "code": layout_code(config),
        "config": {"numQuestions": n, "numChoices": nc, "idDigits": nd},
        "page": {"widthMm": PAGE_W, "heightMm": PAGE_H},
        "markers": [
            {"id": "TL", "cx": 14, "cy": 14, "size": 8},
            {"id": "TR", "cx": 196, "cy": 14, "size": 8},
            {"id": "BR", "cx": 196, "cy": 283, "size": 8},
            {"id": "BL", "cx": 14, "cy": 283, "size": 8},
        ],
        "orientationBar": {"x": 90, "y": 11, "w": 30, "h": 6},
        "regions": {
            "title": {"x": 22, "y": 22, "w": 110, "h": 8},
            "name": {"x": 22, "y": 32, "w": 110, "h": 10},
            "className": {"x": 22, "y": 44, "w": 110, "h": 10},
            "date": {"x": 22, "y": 56, "w": 110, "h": 8},
        },
        "choices": letters,
        "bubbleRadius": 2.5,
        "questions": questions,
        "choiceHeaders": choice_headers,
        "idBlock": id_block,
        "footer": {
            "x": 105,
            "y": 272,
            "text": "Hitamkan bulatan sepenuhnya dengan pensel 2B. Jangan lipat atau conteng penanda sudut.",
        },
    }


def write_golden(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for n, c, d in GOLDEN_CONFIGS:
        layout = build_layout({"numQuestions": n, "numChoices": c, "idDigits": d})
        p = out_dir / f"{layout['code']}.json"
        p.write_text(json.dumps(layout, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        paths.append(p)
    return paths


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Port rujukan build_layout")
    ap.add_argument("--golden", metavar="DIR", help="tulis fixture emas ke DIR")
    ap.add_argument("--config", nargs=3, type=int, metavar=("N", "C", "ID"), help="cetak satu susun atur")
    args = ap.parse_args(argv)
    if args.golden:
        for p in write_golden(Path(args.golden)):
            print("ditulis", p)
        return 0
    if args.config:
        n, c, d = args.config
        print(json.dumps(build_layout({"numQuestions": n, "numChoices": c, "idDigits": d}), indent=2))
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
