from pydantic import BaseModel
from typing import Optional


class UserBase(BaseModel):
    id: int
    name: str
    email: str
    role: str


class UserDetail(UserBase):
    created_at: str
    is_active: bool


class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "member"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ProjectBase(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    created_at: str
    created_by: UserBase
    open_task_count: int


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class TaskBase(BaseModel):
    id: int
    title: str
    description: Optional[str]
    theme: dict
    follow_up_date: Optional[str]
    completed: bool
    date_entered: str
    status: str
    owner: UserBase
    delegated_to: Optional[UserBase]
    predecessor_task_id: Optional[int]
    successor_task_id: Optional[int]


class TaskCreate(BaseModel):
    theme_id: int
    title: str
    description: Optional[str] = None
    follow_up_date: Optional[str] = None
    delegated_to_id: Optional[int] = None
    predecessor_task_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    follow_up_date: Optional[str] = None
    owner_id: Optional[int] = None
    delegated_to_id: Optional[int] = None
    completed: Optional[bool] = None
    status: Optional[str] = None
    theme_id: Optional[int] = None
    deferred_until: Optional[str] = None


class CloseAndFollowUp(BaseModel):
    title: str
    follow_up_date: Optional[str] = None
    description: Optional[str] = None
    delegated_to_id: Optional[int] = None


class CommentBase(BaseModel):
    id: int
    task_id: int
    user: UserBase
    content: str
    created_at: str


class CommentCreate(BaseModel):
    content: str


class CommentUpdate(BaseModel):
    content: str


class SessionCreate(BaseModel):
    user_id: int
