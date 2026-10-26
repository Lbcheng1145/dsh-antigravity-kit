#!/usr/bin/env python3
"""Local HTTP bridge for the Antigravity DSH dashboard.

Binds only to 127.0.0.1. The DSH Client page uses this instead of a shared
DSH remote service, keeping the UI extension isolated from account/settings.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
BRIDGE = BASE_DIR / "antigravity_bridge.py"
LOG = BASE_DIR / "dashboard-server.log"
HOST = os.environ.get("ANTIGRAVITY_DASHBOARD_HOST", "127.0.0.1")
PORT = int(os.environ.get("ANTIGRAVITY_DASHBOARD_PORT", "8765"))
CREATE_NO_WINDOW = 0x08000000


def _interpreter() -> str:
    """Prefer a project virtualenv, then the interpreter running this service."""
    venv = BASE_DIR / ".venv" / "Scripts" / "python.exe"
    if venv.is_file():
        return str(venv)
    return sys.executable


PYTHON = _interpreter()


def _log(message: str) -> None:
    try:
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " " + message + "\n")
    except OSError:
        pass


def run_bridge(args: list[str], timeout: float) -> dict:
    proc = subprocess.run(
        [str(PYTHON), str(BRIDGE), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=CREATE_NO_WINDOW,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "bridge failed").strip()
        raise RuntimeError(detail[-1800:])
    payload = (proc.stdout or "").strip()
    if not payload:
        raise RuntimeError("bridge returned no output")
    return json.loads(payload)


class Handler(BaseHTTPRequestHandler):
    server_version = "AntigravityDashboard/1.0"

    def _headers(self, status: int, content_type: str, length: int) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _json(self, status: int, value: dict) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self._headers(status, "application/json; charset=utf-8", len(body))
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._headers(204, "text/plain", 0)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/health":
                self._json(200, {"ok": True})
                return
            if parsed.path == "/quota":
                workspace = (parse_qs(parsed.query).get("workspace") or [os.getcwd()])[0]
                self._json(200, run_bridge(["--quota", "--json", "--workspace", workspace], 45))
                return
            self._json(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            _log("GET " + self.path + " failed: " + repr(exc))
            self._json(500, {"error": str(exc)})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/run":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            prompt = str(body.get("prompt") or "").strip()
            if not prompt:
                self._json(400, {"error": "prompt is required"})
                return
            workspace = str(body.get("workspace") or os.getcwd())
            model = str(body.get("model") or "flash")
            timeout = float(body.get("timeoutSeconds") or 300)
            data = run_bridge(
                [
                    "--workspace", workspace,
                    "--model", model,
                    "--timeout", str(timeout),
                    "--json",
                    prompt,
                ],
                timeout + 30,
            )
            self._json(200, {
                "conversation_id": data.get("conversation_id") or "",
                "text": data.get("text") or "",
            })
        except Exception as exc:  # noqa: BLE001
            _log("POST /run failed: " + repr(exc))
            self._json(500, {"error": str(exc)})

    def log_message(self, fmt: str, *args) -> None:
        _log(fmt % args)


def main() -> int:
    # A second startup entry point is harmless: fail quietly if the port is taken.
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        _log(f"cannot bind {HOST}:{PORT}: {exc}")
        return 0
    _log(f"listening on http://{HOST}:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
