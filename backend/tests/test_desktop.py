from __future__ import annotations

from trace_api import desktop


class FakeWindow:
    def __init__(self) -> None:
        self.destroyed = False
        self.minimized = False

    def destroy(self) -> None:
        self.destroyed = True

    def minimize(self) -> None:
        self.minimized = True


def teardown_function() -> None:
    desktop._force_quit.clear()


def test_window_closing_minimizes_by_default(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "minimize")

    assert desktop._handle_window_closing(window) is False
    assert window.minimized is True


def test_window_closing_allows_quit_preference(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "quit")

    assert desktop._handle_window_closing(window) is True
    assert window.minimized is False


def test_window_closing_allows_forced_quit(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "minimize")
    desktop._force_quit.set()

    assert desktop._handle_window_closing(window) is True
    assert window.minimized is False


def test_desktop_api_quit_sets_force_quit_and_destroys_window(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_main_window", lambda: window)

    desktop.DesktopApi().quit_app()

    assert desktop._force_quit.is_set()
    assert window.destroyed is True
