from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional
from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

TASK_SELECT = """
    SELECT
        t.id, t.title, t.description, t.follow_up_date, t.completed, t.date_entered, t.status,
        t.predecessor_task_id, t.deferred_until,
        th.id as theme_id, th.name as theme_name,
        o.id as owner_id, o.name as owner_name, o.email as owner_email, o.role as owner_role,
        d.id as delegate_id, d.name as delegate_name, d.email as delegate_email, d.role as delegate_role,
        (SELECT id FROM tasks WHERE predecessor_task_id = t.id AND deleted_at IS NULL LIMIT 1) as successor_task_id
    FROM tasks t
    JOIN themes th ON t.theme_id = th.id
    JOIN users o ON t.owner_id = o.id
    LEFT JOIN users d ON t.delegated_to_id = d.id
"""


def _require_user(session_user_id: Optional[str], x_user_id: Optional[str]) -> int:
    raw = session_user_id or x_user_id
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")


def _format_task(row) -> dict:
    r = dict(row)
    result = {
        "id": r["id"],
        "title": r["title"],
        "description": r["description"],
        "follow_up_date": r["follow_up_date"],
        "completed": bool(r["completed"]),
        "date_entered": r["date_entered"],
        "status": r["status"],
        "predecessor_task_id": r["predecessor_task_id"],
        "successor_task_id": r.get("successor_task_id"),
        "deferred_until": r["deferred_until"],
        "project": {"id": r["theme_id"], "name": r["theme_name"]},
        "owner": {"id": r["owner_id"], "name": r["owner_name"], "email": r["owner_email"], "role": r["owner_role"]},
        "delegated_to": None,
    }
    if r.get("delegate_id"):
        result["delegated_to"] = {
            "id": r["delegate_id"],
            "name": r["delegate_name"],
            "email": r["delegate_email"],
            "role": r["delegate_role"],
        }
    return result


@router.get("")
def get_dashboard(
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        user = conn.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?", (user_id,)
        ).fetchone()

        overdue = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status = 'open' AND deleted_at IS NULL AND follow_up_date < date('now') AND completed = 0"
        ).fetchone()[0]

        upcoming = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status = 'open' AND deleted_at IS NULL AND follow_up_date BETWEEN date('now') AND date('now', '+5 days') AND completed = 0"
        ).fetchone()[0]

        open_total = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status = 'open' AND deleted_at IS NULL"
        ).fetchone()[0]

        delegated_out = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE owner_id = ? AND delegated_to_id IS NOT NULL AND status = 'open' AND deleted_at IS NULL",
            (user_id,),
        ).fetchone()[0]

        delegated_in = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE delegated_to_id = ? AND status = 'open' AND deleted_at IS NULL",
            (user_id,),
        ).fetchone()[0]

    return {
        "user": dict(user),
        "overdue_count": overdue,
        "upcoming_count": upcoming,
        "open_task_count": open_total,
        "my_delegated_out_count": delegated_out,
        "my_delegated_in_count": delegated_in,
    }


@router.get("/by-project")
def by_project(
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        projects = conn.execute(
            """
            SELECT t.id, t.name, t.description, t.status, t.created_at,
                   u.id as creator_id, u.name as creator_name, u.email as creator_email, u.role as creator_role,
                   COUNT(CASE WHEN tk.status = 'open' AND tk.deleted_at IS NULL THEN 1 END) as open_task_count,
                   SUM(CASE WHEN tk.status = 'open' AND tk.deleted_at IS NULL AND tk.follow_up_date < date('now') AND tk.completed = 0 THEN 1 ELSE 0 END) as overdue_count
            FROM themes t
            JOIN users u ON t.created_by_user_id = u.id
            LEFT JOIN tasks tk ON tk.theme_id = t.id
            WHERE t.deleted_at IS NULL
            GROUP BY t.id
            ORDER BY overdue_count DESC, t.status ASC, t.name ASC
            """
        ).fetchall()

        result = []
        for proj in projects:
            pr = dict(proj)
            tasks = conn.execute(
                f"""
                {TASK_SELECT}
                WHERE t.theme_id = ? AND t.deleted_at IS NULL AND t.status = 'open'
                ORDER BY
                    CASE WHEN t.follow_up_date < date('now') AND t.completed = 0 THEN 0
                         WHEN t.follow_up_date BETWEEN date('now') AND date('now', '+5 days') AND t.completed = 0 THEN 1
                         ELSE 2 END,
                    t.follow_up_date ASC NULLS LAST
                """,
                (pr["id"],),
            ).fetchall()
            result.append({
                "project": {
                    "id": pr["id"],
                    "name": pr["name"],
                    "description": pr["description"],
                    "status": pr["status"],
                    "created_at": pr["created_at"],
                    "created_by": {"id": pr["creator_id"], "name": pr["creator_name"], "email": pr["creator_email"], "role": pr["creator_role"]},
                    "open_task_count": pr["open_task_count"],
                },
                "tasks": [_format_task(t) for t in tasks],
                "overdue_count": pr["overdue_count"] or 0,
            })
    return result


@router.get("/by-delegate")
def by_delegate(
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        delegates = conn.execute(
            """
            SELECT u.id, u.name, u.email, u.role,
                   COUNT(t.id) as task_count,
                   SUM(CASE WHEN t.follow_up_date < date('now') AND t.completed = 0 THEN 1 ELSE 0 END) as overdue_count
            FROM users u
            JOIN tasks t ON t.delegated_to_id = u.id
            WHERE t.deleted_at IS NULL AND t.status = 'open'
            GROUP BY u.id
            ORDER BY overdue_count DESC, task_count DESC
            """
        ).fetchall()

        result = []
        for delegate in delegates:
            dr = dict(delegate)
            tasks = conn.execute(
                f"""
                {TASK_SELECT}
                WHERE t.delegated_to_id = ? AND t.deleted_at IS NULL AND t.status = 'open'
                ORDER BY t.follow_up_date ASC NULLS LAST
                """,
                (dr["id"],),
            ).fetchall()
            result.append({
                "user": {"id": dr["id"], "name": dr["name"], "email": dr["email"], "role": dr["role"]},
                "task_count": dr["task_count"],
                "overdue_count": dr["overdue_count"] or 0,
                "tasks": [_format_task(t) for t in tasks],
            })
    return result
