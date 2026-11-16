"""Pelayan statik setempat untuk OMR Semak Jawapan (Python stdlib sahaja).

Penggunaan:
    python tools/serve.py --bind 127.0.0.1 --port 8000 --root <folder>
    python tools/serve.py --bind 0.0.0.0 --port 8000 --app-only   (mod LAN)

Modul ini boleh diimport: make_server(bind, port, root, app_only=False) mengembalikan
ThreadingHTTPServer yang belum berjalan (panggil serve_forever / shutdown).

--app-only: hanya hidangkan aplikasi. Laluan /tests/, /tools/ dan /docs/ dijawab 404.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import posixpath
import urllib.parse
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent

# Folder yang tidak dihidang dalam mod --app-only (kod ujian, alat dan dokumen).
APP_ONLY_BLOCKED = ("/tests", "/tools", "/docs")

# MIME tegas: Windows boleh rosak pemetaan .js melalui registry, dan ES modules
# memerlukan text/javascript yang tepat.
MIME_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".css": "text/css",
    ".html": "text/html",
    ".png": "image/png",
}


def is_blocked_path(raw_path: str) -> bool:
    """True jika laluan URL berada dalam folder yang disekat (mod --app-only).

    Laluan dinormalkan dahulu (asingkan query, nyahkod %, ganti backslash,
    buang segmen . dan ..) supaya variasi seperti /Tools/, /%74ools/ atau
    /tests\\x tidak melepasi semakan. Perbandingan tidak sensitif huruf kerana
    Windows juga tidak sensitif huruf.
    """
    path = urllib.parse.urlsplit(raw_path).path
    path = urllib.parse.unquote(path).replace("\\", "/")
    path = posixpath.normpath("/" + path.lstrip("/")).lower()
    for prefix in APP_ONLY_BLOCKED:
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **MIME_TYPES}
    app_only = False  # ditetapkan oleh make_server(app_only=True)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):  # type: ignore[override]
        # Tiada penyenaraian direktori: folder tanpa index.html pulang 404.
        self.send_error(404, "Not Found")
        return None

    def send_head(self):  # type: ignore[override]
        # Dipanggil oleh GET dan HEAD.
        if self.app_only and is_blocked_path(self.path):
            self.send_error(404, "Not Found")
            return None
        return super().send_head()


class AppOnlyHandler(Handler):
    app_only = True


def make_server(
    bind: str,
    port: int,
    root: Path | str = DEFAULT_ROOT,
    app_only: bool = False,
) -> http.server.ThreadingHTTPServer:
    """Cipta pelayan yang menghidang `root`. Gunakan port 0 untuk port rawak (ujian)."""
    cls = AppOnlyHandler if app_only else Handler
    handler = functools.partial(cls, directory=str(Path(root).resolve()))
    server = http.server.ThreadingHTTPServer((bind, port), handler)
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hidang folder projek OMR Semak Jawapan.")
    parser.add_argument("--bind", default="127.0.0.1", help="Alamat ikatan (lalai 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (lalai 8000)")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Folder untuk dihidang")
    parser.add_argument(
        "--app-only",
        action="store_true",
        help="Hidang aplikasi sahaja; /tests/, /tools/, /docs/ pulang 404",
    )
    args = parser.parse_args(argv)

    server = make_server(args.bind, args.port, args.root, app_only=args.app_only)
    host, port = server.server_address[:2]
    mode = " (mod app sahaja)" if args.app_only else ""
    print(f"Melayan {Path(args.root).resolve()} di http://{host}:{port}/{mode}  (Ctrl+C untuk henti)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
