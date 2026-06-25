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


def test_request_quit_sets_force_quit():
    assert desktop._force_quit.is_set() is False

    desktop._request_quit()

    assert desktop._force_quit.is_set() is True


def test_request_quit_lets_minimize_handler_quit(monkeypatch):
    """A Dock/Cmd+Q quit request must override the minimize-on-close default."""
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "minimize")

    desktop._request_quit()

    assert desktop._handle_window_closing(window) is True
    assert window.minimized is False


def test_install_quit_handler_noop_off_darwin(monkeypatch):
    monkeypatch.setattr(desktop.sys, "platform", "linux")

    # Must not raise and must not touch _force_quit.
    desktop._install_quit_handler()

    assert desktop._force_quit.is_set() is False


def test_close_window_minimizes_when_preference_is_minimize(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_main_window", lambda: window)
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "minimize")

    desktop.DesktopApi().close_window()

    assert window.minimized is True
    assert window.destroyed is False


def test_close_window_destroys_when_preference_is_quit(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_main_window", lambda: window)
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "quit")

    desktop.DesktopApi().close_window()

    assert window.destroyed is True
    assert window.minimized is False


def test_close_window_destroys_when_force_quit(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(desktop, "_main_window", lambda: window)
    monkeypatch.setattr(desktop, "_window_close_action", lambda: "minimize")
    desktop._force_quit.set()

    desktop.DesktopApi().close_window()

    assert window.destroyed is True
    assert window.minimized is False
