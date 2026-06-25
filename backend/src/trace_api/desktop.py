from __future__ import annotations

import os

os.environ.setdefault("TRACE_RUNTIME_MODE", "desktop")
os.environ.setdefault("TRACE_SEED_DEMO", "0")

import socket
import sys
import threading
import time
import urllib.error
import urllib.request

import uvicorn
import webview

from trace_api.db import connect
from trace_api.main import create_app

APP_TITLE = "Trace"
WINDOW_MIN_SIZE = (1180, 760)
WINDOW_SIZE = (1440, 920)
STARTUP_TIMEOUT_SECONDS = 20.0
WINDOW_CLOSE_KEY = "desktop.window_close_action"

_force_quit = threading.Event()
_quit_delegate: object | None = None


def _main_window() -> webview.Window | None:
    return webview.windows[0] if webview.windows else None


def _destroy_main_window() -> None:
    window = _main_window()
    if window is not None:
        window.destroy()


def _schedule_main_window_destroy(delay: float = 0.05) -> None:
    """Destroy the window after the pywebview JS bridge response returns."""
    if sys.platform == "darwin":
        try:
            from PyObjCTools import AppHelper  # type: ignore

            AppHelper.callLater(delay, _destroy_main_window)
            return
        except Exception:
            pass

    timer = threading.Timer(delay, _destroy_main_window)
    timer.daemon = True
    timer.start()


class DesktopApi:
    def choose_file(self) -> str | None:
        window = _main_window()
        if window is None:
            return None
        paths = window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
        )
        if not paths:
            return None
        return str(paths[0])

    def close_window(self) -> None:
        """Apply the user's close-button preference from frontend controls.

        The custom traffic-light close button calls this directly, bypassing
        pywebview's ``windowShouldClose_``/``closing`` path (the native title
        bar is hidden). So we apply the ``desktop.window_close_action``
        preference here: minimize, or actually destroy when set to quit.
        """
        window = _main_window()
        if window is None:
            return
        if not _force_quit.is_set() and _window_close_action() == "minimize":
            try:
                window.minimize()
                return
            except Exception:
                pass
        _schedule_main_window_destroy()

    def minimize_window(self) -> None:
        window = _main_window()
        if window is not None:
            window.minimize()

    def toggle_maximize_window(self) -> None:
        window = _main_window()
        if window is None:
            return
        state = getattr(window, "state", None)
        if state == "maximized":
            window.restore()
        else:
            window.maximize()

    def quit_app(self) -> None:
        """Exit Trace even when close-button behavior is set to minimize."""
        _force_quit.set()
        _schedule_main_window_destroy()


def _window_close_action() -> str:
    conn = connect()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (WINDOW_CLOSE_KEY,)).fetchone()
    except Exception:
        return "minimize"
    finally:
        conn.close()
    value = row["value"] if row else None
    return value if value in {"minimize", "quit"} else "minimize"


def _handle_window_closing(window: webview.Window) -> bool:
    if _force_quit.is_set() or _window_close_action() != "minimize":
        return True
    try:
        window.minimize()
    except Exception:
        return True
    return False


def _request_quit() -> None:
    """Mark the app as quitting so the closing handler stops minimizing.

    macOS routes Dock -> Quit, Cmd+Q and the app menu's Quit through
    ``applicationShouldTerminate_`` (never through the window close button),
    so flipping ``_force_quit`` here lets those paths actually exit even when
    the close-button preference is ``minimize``.
    """
    _force_quit.set()


def _install_quit_handler() -> None:
    """Make genuine app-quit requests bypass the minimize-on-close behavior.

    pywebview implements ``applicationShouldTerminate_`` by firing each
    window's ``closing`` event, which our ``_handle_window_closing`` turns into
    a minimize when the preference is ``minimize``. That swallows Dock -> Quit
    and Cmd+Q. We subclass pywebview's AppDelegate so termination requests set
    ``_force_quit`` first, then defer to the original implementation.
    """
    if sys.platform != "darwin":
        return
    try:
        import objc  # type: ignore
        from webview.platforms.cocoa import BrowserView  # type: ignore
    except Exception:
        return

    current = BrowserView.app.delegate()
    if current is None:
        return
    # Idempotent: don't wrap our own delegate twice.
    if getattr(type(current), "_trace_quit_handler", False):
        return

    base_cls = type(current)
    try:
        class _TraceAppDelegate(base_cls):  # type: ignore[misc, valid-type]
            _trace_quit_handler = True

            def applicationShouldTerminate_(self, app):  # noqa: N802
                _request_quit()
                return objc.super(_TraceAppDelegate, self).applicationShouldTerminate_(app)

        delegate = _TraceAppDelegate.alloc().init()
    except Exception:
        return

    # Keep a strong reference so the delegate isn't garbage collected.
    global _quit_delegate
    _quit_delegate = delegate
    BrowserView._shared_app_delegate = delegate
    BrowserView.app.setDelegate_(delegate)


def _ensure_window_visible(window: webview.Window) -> None:
    """Bring the pywebview window back if macOS launches the app without a key window."""
    _install_quit_handler()
    try:
        window.show()
        window.restore()
    except Exception:
        pass

    if sys.platform != "darwin":
        return
    try:
        from AppKit import NSApp  # type: ignore
        from PyObjCTools import AppHelper  # type: ignore
    except Exception:
        return

    def activate() -> None:
        try:
            window.show()
            window.restore()
        except Exception:
            pass
        try:
            NSApp.activateIgnoringOtherApps_(True)
            for win in list(NSApp.windows() or []):
                try:
                    win.makeKeyAndOrderFront_(None)
                except Exception:
                    continue
        except Exception:
            pass

    AppHelper.callAfter(activate)
    try:
        AppHelper.callLater(0.5, activate)
    except Exception:
        pass


def _customize_macos_window(*_args: object, **_kwargs: object) -> None:
    """Merge the native title bar into the app — transparent titlebar +
    full-size content view so the app's dark background extends behind the
    traffic light buttons (a la VS Code, Linear, Notion).

    pywebview event handlers run on a worker thread, so the actual NSWindow
    mutations are dispatched to the AppKit main thread via AppHelper.

    Crucially: pywebview's cocoa platform paints the titlebar's background view
    with `windowBackgroundColor` whenever the window is not frameless (see
    webview/platforms/cocoa.py:708-712), which would otherwise show as a white
    strip in light mode. We override that paint with `clearColor` so the
    WKWebView (and the app's own dark background) shows through.
    """
    if sys.platform != "darwin":
        return
    try:
        from AppKit import NSApp  # type: ignore
        from PyObjCTools import AppHelper  # type: ignore
    except Exception:
        return

    NSWindowStyleMaskFullSizeContentView = 1 << 15
    NSWindowTitleHidden = 1

    def apply() -> None:
        try:
            wins = list(NSApp.windows() or [])
        except Exception:
            return
        try:
            from AppKit import (  # type: ignore
                NSColor,
                NSMakeRect,
                NSViewHeightSizable,
                NSViewWidthSizable,
            )
        except Exception:
            return
        for win in wins:
            try:
                win.setTitlebarAppearsTransparent_(True)
                win.setTitleVisibility_(NSWindowTitleHidden)

                # Toggle FullSizeContentView off then on — setting an already-set
                # bit is a no-op in AppKit and skips re-layout, so we bounce
                # the bit to force the contentView to re-frame.
                mask = win.styleMask()
                cleared = mask & ~NSWindowStyleMaskFullSizeContentView
                win.setStyleMask_(cleared)
                win.setStyleMask_(cleared | NSWindowStyleMaskFullSizeContentView)

                # Resize the contentView (the WKWebView once pywebview installs
                # it) to fill the entire window frame, including the titlebar
                # area that is now part of the content rect.
                content = win.contentView()
                if content is not None:
                    wf = win.frame()
                    content.setAutoresizingMask_(
                        NSViewWidthSizable | NSViewHeightSizable
                    )
                    content.setFrame_(NSMakeRect(0, 0, wf.size.width, wf.size.height))

                # Override pywebview's titlebar background paint so it doesn't
                # cover the WKWebView with windowBackgroundColor.
                cv = win.contentView()
                sv = cv.superview() if cv is not None else None
                if sv is not None:
                    subs = sv.subviews()
                    if subs is not None and subs.count() > 0:
                        titlebar_paint = subs.lastObject()
                        if titlebar_paint is not None and hasattr(
                            titlebar_paint, "setBackgroundColor_"
                        ):
                            titlebar_paint.setBackgroundColor_(NSColor.clearColor())

                if hasattr(win, "invalidateShadow"):
                    win.invalidateShadow()
                if hasattr(win, "displayIfNeeded"):
                    win.displayIfNeeded()
            except Exception:
                continue

    AppHelper.callAfter(apply)
    # Re-apply after short delays — pywebview's WKWebView setContentView_ call
    # races with our hook, and pywebview re-paints the titlebar background
    # whenever the page navigates.
    try:
        AppHelper.callLater(0.4, apply)
        AppHelper.callLater(1.2, apply)
    except Exception:
        pass


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

    # Append a runtime hint the SPA can read on first load to know it's running
    # inside pywebview (frontend uses this to reserve top-padding for the macOS
    # traffic light buttons).
    window = webview.create_window(
        APP_TITLE,
        f"{base_url}/?runtime=pywebview",
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=WINDOW_MIN_SIZE,
        text_select=True,
        js_api=DesktopApi(),
    )
    # Hook every relevant lifecycle event so the title bar styling lands no
    # matter when the NSWindow is first observable. Each handler dispatches
    # its NSWindow mutations to the AppKit main thread.
    for ev_name in ("before_show", "shown", "loaded"):
        ev = getattr(window.events, ev_name, None)
        if ev is not None:
            ev += _customize_macos_window
    window.events.closing += _handle_window_closing
    webview.start(_ensure_window_visible, window, debug=False)

    # Keep a reference alive until the window exits.
    _ = window
    server.should_exit = True
    server_thread.join(timeout=5)


if __name__ == "__main__":
    run_desktop()
