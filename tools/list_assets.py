"""Jana precache-manifest.js dan tests/fixtures/assets.json.

Guna: python tools/list_assets.py
Versi cache = hash kandungan semua aset, jadi berubah apabila mana-mana fail berubah.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE_DIRS = {"tests", "tools", "docs", "__pycache__", ".git"}
EXCLUDE_FILES = {"sw.js", "precache-manifest.js", "README.md", ".gitignore", "start.bat", "start-lan.bat"}
EXTS = {".html", ".js", ".mjs", ".css", ".json", ".png", ".svg", ".webmanifest", ".ico", ".woff2", ".txt"}


def collect():
    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT)
        if rel.parts[0] in EXCLUDE_DIRS or rel.name in EXCLUDE_FILES:
            continue
        if p.suffix.lower() not in EXTS:
            continue
        files.append(rel.as_posix())
    return files


def main():
    files = collect()
    h = hashlib.sha256()
    for f in files:
        h.update(f.encode())
        h.update(b"\0")
        h.update((ROOT / f).read_bytes())
    version = h.hexdigest()[:12]
    precache = ["./"] + files
    js = (
        "/* DIJANA oleh tools/list_assets.py - jangan edit. */\n"
        f"self.CACHE_VERSION = {json.dumps(version)};\n"
        f"self.PRECACHE = {json.dumps(precache, indent=2)};\n"
    )
    (ROOT / "precache-manifest.js").write_text(js, encoding="utf-8", newline="\n")
    fx = ROOT / "tests" / "fixtures" / "assets.json"
    fx.parent.mkdir(parents=True, exist_ok=True)
    fx.write_text(json.dumps({"version": version, "assets": precache}, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"versi {version}, {len(precache)} aset")
    return 0


if __name__ == "__main__":
    sys.exit(main())
