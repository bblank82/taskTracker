from typing import Optional
from fastapi import Cookie, Header, HTTPException, Request
from database import get_db


def get_current_user(
    request: Request,
    session_user_id: Optional[str] = Cookie(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    user_id_str = session_user_id or x_user_id
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = int(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, email, role, created_at, is_active FROM users WHERE id = ? AND is_active = 1",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return dict(row)
