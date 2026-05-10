from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
from ..utils import new_id, now_iso
from ..workspace import DEFAULT_WORKSPACE_ID

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceIn(BaseModel):
    name: str
    theme_color: str | None = None
    default_llm_profile_id: str | None = None


class WorkspacePatch(BaseModel):
    name: str | None = None
    theme_color: str | None = None
    default_llm_profile_id: str | None = None


def _workspace_or_404(conn, workspace_id: str) -> dict:
    row = conn.execute("SELECT * FROM workspace WHERE id = ?", (workspace_id,)).fetchone()
    if not row:
        raise HTTPException(404, "workspace not found")
    return row_to_dict(row)


@router.get("")
def list_workspaces() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT w.*,
                   COUNT(DISTINCT p.id) AS project_count,
                   COUNT(DISTINCT t.id) AS thread_count
            FROM workspace w
            LEFT JOIN project p ON p.workspace_id = w.id
            LEFT JOIN thread t ON t.workspace_id = w.id
            GROUP BY w.id
            ORDER BY
              CASE WHEN w.id = ? THEN 0 ELSE 1 END,
              w.updated_at DESC,
              w.name COLLATE NOCASE ASC
            """,
            (DEFAULT_WORKSPACE_ID,),
        ).fetchall()
        return [row_to_dict(row) for row in rows]
    finally:
        conn.close()


@router.post("", status_code=201)
def create_workspace(body: WorkspaceIn) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")
    now = now_iso()
    workspace_id = new_id("ws")
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO workspace (id,name,theme_color,default_llm_profile_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?)
            """,
            (workspace_id, name, body.theme_color, body.default_llm_profile_id, now, now),
        )
        conn.commit()
        return _workspace_or_404(conn, workspace_id)
    finally:
        conn.close()


@router.patch("/{workspace_id}")
def patch_workspace(workspace_id: str, patch: WorkspacePatch) -> dict:
    conn = connect()
    try:
        current = _workspace_or_404(conn, workspace_id)
        name = patch.name.strip() if patch.name is not None else current["name"]
        if not name:
            raise HTTPException(400, "name is required")
        conn.execute(
            """
            UPDATE workspace
            SET name=?, theme_color=?, default_llm_profile_id=?, updated_at=?
            WHERE id=?
            """,
            (
                name,
                patch.theme_color if patch.theme_color is not None else current["theme_color"],
                patch.default_llm_profile_id
                if patch.default_llm_profile_id is not None
                else current["default_llm_profile_id"],
                now_iso(),
                workspace_id,
            ),
        )
        conn.commit()
        return _workspace_or_404(conn, workspace_id)
    finally:
        conn.close()


@router.delete("/{workspace_id}", status_code=204)
def delete_workspace(workspace_id: str) -> None:
    if workspace_id == DEFAULT_WORKSPACE_ID:
        raise HTTPException(400, "default workspace cannot be deleted")
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM workspace WHERE id = ?", (workspace_id,)).fetchone()
        if not row:
            raise HTTPException(404, "workspace not found")
        conn.execute("DELETE FROM workspace WHERE id = ?", (workspace_id,))
        conn.commit()
    finally:
        conn.close()
