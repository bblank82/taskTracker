from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional
from database import get_db
from schemas import ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _require_user(session_user_id: Optional[str], x_user_id: Optional[str]) -> int:
    raw = session_user_id or x_user_id
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")


def _format_project(row) -> dict:
    r = dict(row)
    return {
        "id": r["id"],
        "name": r["name"],
        "description": r["description"],
        "status": r["status"],
        "created_at": r["created_at"],
        "created_by": {"id": r["creator_id"], "name": r["creator_name"], "email": r["creator_email"], "role": r["creator_role"]},
        "open_task_count": r["open_task_count"],
    }


@router.get("")
def list_projects(
    status: str = "all",
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    where = "t.deleted_at IS NULL"
    if status in ("open", "closed"):
        where += f" AND t.status = '{status}'"
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT t.id, t.name, t.description, t.status, t.created_at,
                   u.id as creator_id, u.name as creator_name, u.email as creator_email, u.role as creator_role,
                   COUNT(CASE WHEN tk.status = 'open' AND tk.deleted_at IS NULL THEN 1 END) as open_task_count
            FROM themes t
            JOIN users u ON t.created_by_user_id = u.id
            LEFT JOIN tasks tk ON tk.theme_id = t.id
            WHERE {where}
            GROUP BY t.id
            ORDER BY t.status ASC, t.name ASC
            """
        ).fetchall()
    return [_format_project(r) for r in rows]


@router.post("")
def create_project(
    body: ProjectCreate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO themes (name, description, created_by_user_id) VALUES (?, ?, ?)",
            (body.name, body.description, user_id),
        )
        project_id = cursor.lastrowid
        row = conn.execute(
            """
            SELECT t.id, t.name, t.description, t.status, t.created_at,
                   u.id as creator_id, u.name as creator_name, u.email as creator_email, u.role as creator_role,
                   0 as open_task_count
            FROM themes t
            JOIN users u ON t.created_by_user_id = u.id
            WHERE t.id = ?
            """,
            (project_id,),
        ).fetchone()
    return _format_project(row)


@router.get("/{project_id}")
def get_project(
    project_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT t.id, t.name, t.description, t.status, t.created_at,
                   u.id as creator_id, u.name as creator_name, u.email as creator_email, u.role as creator_role,
                   COUNT(CASE WHEN tk.status = 'open' AND tk.deleted_at IS NULL THEN 1 END) as open_task_count
            FROM themes t
            JOIN users u ON t.created_by_user_id = u.id
            LEFT JOIN tasks tk ON tk.theme_id = t.id
            WHERE t.id = ? AND t.deleted_at IS NULL
            GROUP BY t.id
            """,
            (project_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return _format_project(row)


@router.patch("/{project_id}")
def update_project(
    project_id: int,
    body: ProjectUpdate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [project_id]
    with get_db() as conn:
        conn.execute(f"UPDATE themes SET {set_clause} WHERE id = ? AND deleted_at IS NULL", values)
        row = conn.execute(
            """
            SELECT t.id, t.name, t.description, t.status, t.created_at,
                   u.id as creator_id, u.name as creator_name, u.email as creator_email, u.role as creator_role,
                   COUNT(CASE WHEN tk.status = 'open' AND tk.deleted_at IS NULL THEN 1 END) as open_task_count
            FROM themes t
            JOIN users u ON t.created_by_user_id = u.id
            LEFT JOIN tasks tk ON tk.theme_id = t.id
            WHERE t.id = ?
            GROUP BY t.id
            """,
            (project_id,),
        ).fetchone()
    return _format_project(row)


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        open_tasks = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE theme_id = ? AND status = 'open' AND deleted_at IS NULL",
            (project_id,),
        ).fetchone()[0]
        if open_tasks > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Project has {open_tasks} open tasks. Close or reassign them first.",
            )
        conn.execute(
            "UPDATE themes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
            (project_id,),
        )
    return {"ok": True}
