from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
from ..utils import new_id, now_iso
from ..workspace import request_workspace_id

router = APIRouter(prefix="/todos", tags=["todos"])


def _now() -> str:
    return now_iso()


def _id(prefix: str) -> str:
    return new_id(prefix)


class TodoIn(BaseModel):
    text: str
    due_date: str | None = None  # YYYY-MM-DD
    thread_id: str | None = None


class TodoPatch(BaseModel):
    text: str | None = None
    due_date: str | None = None
    done: bool | None = None
    thread_id: str | None = None
    clear_thread: bool | None = None
    clear_due_date: bool | None = None


def _select_with_thread(conn, todo_id: str, workspace_id: str) -> dict:
    row = conn.execute(
        """SELECT t.*, th.title AS thread_title
           FROM todo t
           LEFT JOIN thread th ON th.id = t.thread_id
           WHERE t.id = ? AND t.workspace_id = ?""",
        (todo_id, workspace_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "todo not found")
    d = row_to_dict(row)
    return d


@router.get("")
def list_todos(
    done: int | None = None,
    workspace_id: str = Depends(request_workspace_id),
) -> list[dict]:
    conn = connect()
    try:
        q = """SELECT t.*, th.title AS thread_title
               FROM todo t
               LEFT JOIN thread th ON th.id = t.thread_id
               WHERE t.workspace_id = ?"""
        params: tuple = (workspace_id,)
        if done is not None:
            q += " AND t.done = ?"
            params = (workspace_id, 1 if done else 0)
        # Unfinished first, then by due_date (NULLs last), then newest.
        q += " ORDER BY t.done ASC, (t.due_date IS NULL), t.due_date ASC, t.created_at DESC"
        rows = conn.execute(q, params).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.post("", status_code=201)
def create_todo(body: TodoIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    if not body.text.strip():
        raise HTTPException(400, "text is required")
    conn = connect()
    try:
        if body.thread_id:
            exists = conn.execute(
                "SELECT 1 FROM thread WHERE id = ? AND workspace_id = ?",
                (body.thread_id, workspace_id),
            ).fetchone()
            if not exists:
                raise HTTPException(404, "thread not found")
        todo_id = _id("td")
        conn.execute(
            "INSERT INTO todo (id,thread_id,text,due_date,done,done_at,created_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                todo_id,
                body.thread_id,
                body.text.strip(),
                body.due_date,
                0,
                None,
                _now(),
                workspace_id,
            ),
        )
        conn.commit()
        return _select_with_thread(conn, todo_id, workspace_id)
    finally:
        conn.close()


@router.patch("/{todo_id}")
def patch_todo(todo_id: str, patch: TodoPatch, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM todo WHERE id = ? AND workspace_id = ?",
            (todo_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "todo not found")
        current = row_to_dict(row)

        new_text = patch.text if patch.text is not None else current["text"]

        if patch.clear_due_date:
            new_due: str | None = None
        elif patch.due_date is not None:
            new_due = patch.due_date or None
        else:
            new_due = current["due_date"]

        if patch.clear_thread:
            new_thread: str | None = None
        elif patch.thread_id is not None:
            if patch.thread_id == "":
                new_thread = None
            else:
                tr = conn.execute(
                    "SELECT 1 FROM thread WHERE id = ? AND workspace_id = ?",
                    (patch.thread_id, workspace_id),
                ).fetchone()
                if not tr:
                    raise HTTPException(404, "thread not found")
                new_thread = patch.thread_id
        else:
            new_thread = current["thread_id"]

        if patch.done is not None:
            new_done = 1 if patch.done else 0
            if patch.done and not current["done"]:
                new_done_at: str | None = _now()
            elif not patch.done and current["done"]:
                new_done_at = None
            else:
                new_done_at = current["done_at"]
        else:
            new_done = current["done"]
            new_done_at = current["done_at"]

        conn.execute(
            "UPDATE todo SET text=?, due_date=?, thread_id=?, done=?, done_at=? WHERE id=? AND workspace_id=?",
            (new_text, new_due, new_thread, new_done, new_done_at, todo_id, workspace_id),
        )
        if new_thread:
            conn.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ? AND workspace_id = ?",
                (_now(), new_thread, workspace_id),
            )
        conn.commit()
        return _select_with_thread(conn, todo_id, workspace_id)
    finally:
        conn.close()


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: str, workspace_id: str = Depends(request_workspace_id)) -> None:
    conn = connect()
    try:
        cur = conn.execute(
            "DELETE FROM todo WHERE id = ? AND workspace_id = ?",
            (todo_id, workspace_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "todo not found")
        conn.commit()
    finally:
        conn.close()
