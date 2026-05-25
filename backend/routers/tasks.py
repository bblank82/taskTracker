from fastapi import APIRouter, Cookie, Header, HTTPException
from typing import Optional
from database import get_db
from schemas import TaskCreate, TaskUpdate, CloseAndFollowUp

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

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
def list_tasks(
    theme_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    delegated_to_id: Optional[int] = None,
    mine: Optional[bool] = None,
    status: str = "open",
    due: Optional[str] = None,
    upcoming_days: int = 5,
    completed: Optional[bool] = None,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    current_user_id = _require_user(session_user_id, x_user_id)
    conditions = ["t.deleted_at IS NULL"]
    params: list = []

    if status and status != "all":
        conditions.append("t.status = ?")
        params.append(status)
    if theme_id:
        conditions.append("t.theme_id = ?")
        params.append(theme_id)
    if mine:
        conditions.append("(t.owner_id = ? OR t.delegated_to_id = ?)")
        params.extend([current_user_id, current_user_id])
    else:
        if owner_id:
            conditions.append("t.owner_id = ?")
            params.append(owner_id)
        if delegated_to_id:
            conditions.append("t.delegated_to_id = ?")
            params.append(delegated_to_id)
    if completed is not None:
        conditions.append("t.completed = ?")
        params.append(1 if completed else 0)
    if due == "overdue":
        conditions.append("t.follow_up_date < date('now') AND t.completed = 0")
    elif due == "upcoming":
        conditions.append(f"t.follow_up_date BETWEEN date('now') AND date('now', '+{upcoming_days} days') AND t.completed = 0")

    where = " AND ".join(conditions)
    with get_db() as conn:
        rows = conn.execute(
            f"{TASK_SELECT} WHERE {where} ORDER BY t.follow_up_date ASC NULLS LAST, t.date_entered DESC",
            params,
        ).fetchall()
    return [_format_task(r) for r in rows]


@router.post("")
def create_task(
    body: TaskCreate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        theme = conn.execute(
            "SELECT id FROM themes WHERE id = ? AND deleted_at IS NULL", (body.theme_id,)
        ).fetchone()
        if not theme:
            raise HTTPException(status_code=404, detail="Project not found")
        cursor = conn.execute(
            "INSERT INTO tasks (theme_id, title, description, follow_up_date, owner_id, delegated_to_id, predecessor_task_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (body.theme_id, body.title, body.description, body.follow_up_date, user_id, body.delegated_to_id, body.predecessor_task_id),
        )
        task_id = cursor.lastrowid
        row = conn.execute(f"{TASK_SELECT} WHERE t.id = ?", (task_id,)).fetchone()
    return _format_task(row)


@router.get("/{task_id}")
def get_task(
    task_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        row = conn.execute(
            f"{TASK_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL", (task_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return _format_task(row)


@router.patch("/{task_id}")
def update_task(
    task_id: int,
    body: TaskUpdate,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "completed" in data:
        data["completed"] = 1 if data["completed"] else 0
    set_clause = ", ".join(f"{k} = ?" for k in data)
    values = list(data.values()) + [task_id]
    with get_db() as conn:
        affected = conn.execute(
            f"UPDATE tasks SET {set_clause} WHERE id = ? AND deleted_at IS NULL", values
        ).rowcount
        if affected == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        row = conn.execute(f"{TASK_SELECT} WHERE t.id = ?", (task_id,)).fetchone()
    return _format_task(row)


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        affected = conn.execute(
            "UPDATE tasks SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND deleted_at IS NULL",
            (task_id,),
        ).rowcount
    if affected == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


@router.post("/{task_id}/close-and-follow-up")
def close_and_follow_up(
    task_id: int,
    body: CloseAndFollowUp,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        old = conn.execute(
            "SELECT id, theme_id, status FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)
        ).fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Task not found")
        if old["status"] == "closed":
            raise HTTPException(status_code=409, detail="Task is already closed")

        conn.execute(
            "UPDATE tasks SET status = 'closed', completed = 1 WHERE id = ?", (task_id,)
        )
        cursor = conn.execute(
            "INSERT INTO tasks (theme_id, title, description, follow_up_date, owner_id, delegated_to_id, predecessor_task_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (old["theme_id"], body.title, body.description, body.follow_up_date, user_id, body.delegated_to_id, task_id),
        )
        new_task_id = cursor.lastrowid

        closed_row = conn.execute(f"{TASK_SELECT} WHERE t.id = ?", (task_id,)).fetchone()
        new_row = conn.execute(f"{TASK_SELECT} WHERE t.id = ?", (new_task_id,)).fetchone()

    return {"closed_task": _format_task(closed_row), "new_task": _format_task(new_row)}


@router.get("/{task_id}/chain")
def get_task_chain(
    task_id: int,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    _require_user(session_user_id, x_user_id)
    with get_db() as conn:
        exists = conn.execute(
            "SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Task not found")

        predecessors = []
        current_id = task_id
        while True:
            row = conn.execute(
                "SELECT id, title, status, completed, follow_up_date, predecessor_task_id FROM tasks WHERE id = ? AND deleted_at IS NULL",
                (current_id,),
            ).fetchone()
            if not row or row["predecessor_task_id"] is None:
                break
            pred = conn.execute(
                "SELECT id, title, status, completed, follow_up_date FROM tasks WHERE id = ? AND deleted_at IS NULL",
                (row["predecessor_task_id"],),
            ).fetchone()
            if not pred:
                break
            predecessors.insert(0, dict(pred))
            current_id = pred["id"]

        successors = []
        current_id = task_id
        while True:
            succ = conn.execute(
                "SELECT id, title, status, completed, follow_up_date FROM tasks WHERE predecessor_task_id = ? AND deleted_at IS NULL LIMIT 1",
                (current_id,),
            ).fetchone()
            if not succ:
                break
            successors.append(dict(succ))
            current_id = succ["id"]

        current_task = conn.execute(
            "SELECT id, title, status, completed, follow_up_date FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

    chain = []
    for i, t in enumerate(predecessors):
        t["position"] = i - len(predecessors)
        chain.append(t)
    current_dict = dict(current_task)
    current_dict["position"] = 0
    chain.append(current_dict)
    for i, t in enumerate(successors):
        t["position"] = i + 1
        chain.append(t)

    return {"chain": chain, "current_task_id": task_id}
