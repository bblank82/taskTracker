from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional
from database import get_db
from schemas import CommentCreate, CommentUpdate

router = APIRouter(prefix="/api/tasks", tags=["comments"])

COMMENT_SELECT = """
    SELECT c.id, c.task_id, c.content, c.created_at,
           u.id as user_id, u.name as user_name, u.email as user_email, u.role as user_role
    FROM comments c
    JOIN users u ON c.user_id = u.id
"""


def _require_user(session_user_id: Optional[str], x_user_id: Optional[str]) -> int:
    raw = session_user_id or x_user_id
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")


def _format_comment(row) -> dict:
    r = dict(row)
    return {
        "id": r["id"],
        "task_id": r["task_id"],
        "content": r["content"],
        "created_at": r["created_at"],
        "user": {"id": r["user_id"], "name": r["user_name"], "email": r["user_email"], "role": r["user_role"]},
    }


@router.get("/{task_id}/comments")
def list_comments(
    task_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        rows = conn.execute(
            f"{COMMENT_SELECT} WHERE c.task_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at ASC",
            (task_id,),
        ).fetchall()
    return [_format_comment(r) for r in rows]


@router.post("/{task_id}/comments")
def create_comment(
    task_id: int,
    body: CommentCreate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        cursor = conn.execute(
            "INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)",
            (task_id, user_id, body.content),
        )
        row = conn.execute(
            f"{COMMENT_SELECT} WHERE c.id = ?", (cursor.lastrowid,)
        ).fetchone()
    return _format_comment(row)


@router.patch("/{task_id}/comments/{comment_id}")
def update_comment(
    task_id: int,
    comment_id: int,
    body: CommentUpdate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        comment = conn.execute(
            "SELECT id, user_id FROM comments WHERE id = ? AND task_id = ? AND deleted_at IS NULL",
            (comment_id, task_id),
        ).fetchone()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment["user_id"] != user_id:
            current = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
            if not current or current["role"] != "lead":
                raise HTTPException(status_code=403, detail="Cannot edit another user's comment")
        conn.execute("UPDATE comments SET content = ? WHERE id = ?", (body.content, comment_id))
        row = conn.execute(f"{COMMENT_SELECT} WHERE c.id = ?", (comment_id,)).fetchone()
    return _format_comment(row)


@router.delete("/{task_id}/comments/{comment_id}")
def delete_comment(
    task_id: int,
    comment_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        comment = conn.execute(
            "SELECT id, user_id FROM comments WHERE id = ? AND task_id = ? AND deleted_at IS NULL",
            (comment_id, task_id),
        ).fetchone()
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        if comment["user_id"] != user_id:
            current = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
            if not current or current["role"] != "lead":
                raise HTTPException(status_code=403, detail="Cannot delete another user's comment")
        conn.execute(
            "UPDATE comments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
            (comment_id,),
        )
    return {"ok": True}
