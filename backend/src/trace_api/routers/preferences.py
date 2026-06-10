from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import connect

router = APIRouter(prefix="/preferences", tags=["preferences"])

THEME_KEY = "ui.theme"
THEME_VALUES = {"dark", "light", "system"}
WINDOW_CLOSE_KEY = "desktop.window_close_action"
WINDOW_CLOSE_VALUES = {"minimize", "quit"}


class ThemePreferenceIn(BaseModel):
    preference: str


class WindowClosePreferenceIn(BaseModel):
    action: str


def _set_setting(key: str, value: str) -> None:
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO settings (key,value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()


def _get_setting(key: str) -> str | None:
    conn = connect()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None
    finally:
        conn.close()


@router.get("/theme")
def get_theme_preference() -> dict:
    value = _get_setting(THEME_KEY)
    if value not in THEME_VALUES:
        value = "dark"
    return {"preference": value}


@router.put("/theme")
def set_theme_preference(body: ThemePreferenceIn) -> dict:
    preference = body.preference.strip()
    if preference not in THEME_VALUES:
        raise HTTPException(400, f"preference must be one of {sorted(THEME_VALUES)}")
    _set_setting(THEME_KEY, preference)
    return {"preference": preference}


@router.get("/window-close")
def get_window_close_preference() -> dict:
    value = _get_setting(WINDOW_CLOSE_KEY)
    if value not in WINDOW_CLOSE_VALUES:
        value = "minimize"
    return {"action": value}


@router.put("/window-close")
def set_window_close_preference(body: WindowClosePreferenceIn) -> dict:
    action = body.action.strip()
    if action not in WINDOW_CLOSE_VALUES:
        raise HTTPException(400, f"action must be one of {sorted(WINDOW_CLOSE_VALUES)}")
    _set_setting(WINDOW_CLOSE_KEY, action)
    return {"action": action}
