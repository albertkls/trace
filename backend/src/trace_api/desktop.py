from __future__ import annotations

import os

os.environ.setdefault("TRACE_RUNTIME_MODE", "desktop")
os.environ.setdefault("TRACE_SEED_DEMO", "0")

import socket
import threading
import time
import urllib.error
import urllib.request

import uvicorn
import webview

from trace_api import __version__
from trace_api.main import create_app

APP_TITLE = f"Trace {__version__}"
WINDOW_MIN_SIZE = (1180, 760)
WINDOW_SIZE = (1440, 920)
STARTUP_TIMEOUT_SECONDS = 20.0


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_health(url: str, timeout_seconds: float = STARTUP_TIMEOUT_SECONDS) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None

    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError) as exc:
            last_error = exc
            time.sleep(0.2)

    raise RuntimeError(f"Trace backend failed to start: {last_error}")


def run_desktop() -> None:
    port = _find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    health_url = f"{base_url}/api/health"

    os.environ["TRACE_HOST"] = "127.0.0.1"
    os.environ["TRACE_PORT"] = str(port)
    os.environ.setdefault("TRACE_LOG_LEVEL", "warning")

    app = create_app()
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level=os.getenv("TRACE_LOG_LEVEL", "warning"),
        access_log=False,
        server_header=False,
    )
    server = uvicorn.Server(config)
    server.install_signal_handlers = lambda: None  # type: ignore[method-assign]

    server_thread = threading.Thread(target=server.run, name="trace-api", daemon=True)
    server_thread.start()
    _wait_for_health(health_url)

    window = webview.create_window(
        APP_TITLE,
        base_url,
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=WINDOW_MIN_SIZE,
        text_select=True,
    )
    webview.start(debug=False)

    # Keep a reference alive until the window exits.
    _ = window
    server.should_exit = True
    server_thread.join(timeout=5)


if __name__ == "__main__":
    run_desktop()
