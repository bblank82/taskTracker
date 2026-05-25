from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional
from database import get_db
from schemas import UserCreate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def _require_user(session_user_id: Optional[str], x_user_id: Optional[str]) -> int:
    raw = session_user_id or x_user_id
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")


@router.post("")
def create_user(
    body: UserCreate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already exists")
        cursor = conn.execute(
            "INSERT INTO users (name, email, role) VALUES (?, ?, ?)",
            (body.name, body.email, body.role),
        )
        row = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return dict(row)


@router.get("/{user_id}")
def get_user(
    user_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "is_active" in fields:
        fields["is_active"] = 1 if fields["is_active"] else 0
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [user_id]
    with get_db() as conn:
        conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        row = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    current_user_id = _require_user(session_user_id, x_user_id)
    if user_id == current_user_id:
        raise HTTPException(status_code=403, detail="Cannot deactivate yourself")
    with get_db() as conn:
        open_tasks = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE (owner_id = ? OR delegated_to_id = ?) AND status = 'open' AND deleted_at IS NULL",
            (user_id, user_id),
        ).fetchone()[0]
        if open_tasks > 0:
            raise HTTPException(
                status_code=409,
                detail=f"User has {open_tasks} open tasks. Reassign them first.",
            )
        conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
    return {"ok": True}


@router.get("/{user_id}/tasks")
def get_user_open_tasks(
    user_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT t.id, t.title, t.follow_up_date, t.status,
                   u.id as owner_id, u.name as owner_name,
                   d.id as delegate_id, d.name as delegate_name,
                   th.id as project_id, th.name as project_name
            FROM tasks t
            JOIN users u ON t.owner_id = u.id
            LEFT JOIN users d ON t.delegated_to_id = d.id
            JOIN themes th ON t.theme_id = th.id
            WHERE (t.owner_id = ? OR t.delegated_to_id = ?)
              AND t.status = 'open'
              AND t.deleted_at IS NULL
            ORDER BY t.follow_up_date ASC NULLS LAST
            """,
            (user_id, user_id),
        ).fetchall()
    return [dict(r) for r in rows]
