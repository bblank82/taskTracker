from fastapi import APIRouter, Cookie, Header, HTTPException, Response
from typing import Optional
from database import get_db
from schemas import SessionCreate

router = APIRouter(prefix="/api", tags=["session"])


def _resolve_user_id(session_user_id: Optional[str], x_user_id: Optional[str]) -> Optional[int]:
    raw = session_user_id or x_user_id
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


@router.get("/users")
def list_users():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE is_active = 1 ORDER BY name"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/session")
def login(body: SessionCreate, response: Response):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE id = ? AND is_active = 1",
            (body.user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    response.set_cookie(
        key="session_user_id",
        value=str(body.user_id),
        httponly=True,
        samesite="lax",
    )
    return {"user": dict(row)}


@router.delete("/session")
def logout(response: Response):
    response.delete_cookie("session_user_id")
    return {"ok": True}


@router.get("/session")
def get_session(
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = _resolve_user_id(session_user_id, x_user_id)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE id = ? AND is_active = 1",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return {"user": dict(row)}
