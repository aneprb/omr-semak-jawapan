"""Jalankan tests/index.html dalam Edge headless dan hurai ringkasan.

Penggunaan:
    python tools/run_tests.py [--browser LALUAN] [--only layout,decide] [--verbose]
Kod keluar: 0 = semua lulus (FAIL 0), 1 = ada kegagalan / halaman tidak selesai.

Mod lalai: halaman ujian menghantar ringkasan melalui POST /__report ke pelayan ini
(sah walaupun ujian menunggu I/O sebenar seperti IndexedDB). Mod --dump-dom: guna
--virtual-time-budget + --dump-dom (cara asal; boleh terhenti awal jika ada I/O sebenar).
"""

from __future__ import annotations

import argparse
import functools
import html
import re
import subprocess
import sys
import tempfile
import threading
import http.server
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from serve import DEFAULT_ROOT, Handler  # noqa: E402

DEFAULT_BROWSER = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


def make_report_server(root, report: dict, done: threading.Event, quiet: bool):
    class ReportHandler(Handler):
        def do_POST(self):  # noqa: N802
            if self.path.split("?")[0] == "/__report":
                n = int(self.headers.get("Content-Length", 0))
                report["text"] = self.rfile.read(n).decode("utf-8", "replace")
                self.send_response(204)
                self.end_headers()
                done.set()
            else:
                self.send_error(404)

        def log_message(self, fmt, *a):
            if not quiet:
                super().log_message(fmt, *a)

    handler = functools.partial(ReportHandler, directory=str(Path(root).resolve()))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    srv.daemon_threads = True
    return srv


def kill_tree(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            pass


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Jalankan ujian pelayar dengan Edge headless")
    ap.add_argument("--browser", default=DEFAULT_BROWSER, help="laluan msedge/chrome")
    ap.add_argument("--only", default="", help="senarai nama ujian dipisah koma (cth. layout,decide)")
    ap.add_argument("--budget", type=int, default=600000, help="virtual-time-budget (ms), mod --dump-dom")
    ap.add_argument("--timeout", type=int, default=600, help="had masa menunggu ujian (saat)")
    ap.add_argument("--dump-dom", action="store_true", help="guna mod --dump-dom + virtual-time")
    ap.add_argument("--verbose", action="store_true", help="cetak semua baris PASS dan log pelayan")
    args = ap.parse_args(argv)

    if not Path(args.browser).exists():
        print(f"Pelayar tidak dijumpai: {args.browser} (guna --browser)", file=sys.stderr)
        return 1

    report: dict = {}
    done = threading.Event()
    server = make_report_server(DEFAULT_ROOT, report, done, quiet=not args.verbose)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/tests/index.html" + (f"?only={args.only}" if args.only else "")

    summary = None
    try:
        with tempfile.TemporaryDirectory(prefix="omr-edge-") as profile:
            cmd = [args.browser, "--headless=new", "--disable-gpu", "--no-first-run",
                   "--no-default-browser-check", f"--user-data-dir={profile}"]
            if args.dump_dom:
                cmd += [f"--virtual-time-budget={args.budget}", "--dump-dom", url]
                try:
                    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                                         errors="replace", timeout=args.timeout).stdout
                except subprocess.TimeoutExpired:
                    out = ""
                m = re.search(r'<pre id="summary">(.*?)</pre>', out, re.S)
                summary = html.unescape(m.group(1)).strip() if m else None
            else:
                proc = subprocess.Popen(cmd + [url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    if done.wait(args.timeout):
                        summary = report["text"].strip()
                finally:
                    kill_tree(proc)
    finally:
        server.shutdown()
        server.server_close()

    counts = re.search(r"PASS (\d+) / FAIL (\d+)", summary or "")
    if not summary or not counts or "SELESAI" not in summary:
        print(f"Ujian tidak selesai dalam {args.timeout}s atau ringkasan tiada:", file=sys.stderr)
        print(summary or "(tiada ringkasan)", file=sys.stderr)
        return 1

    for line in summary.splitlines():
        is_single_pass = line.startswith("PASS ") and " / FAIL " not in line
        if args.verbose or not is_single_pass:
            print(line)
    return 0 if int(counts.group(2)) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
