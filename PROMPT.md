# TaskFlow — Full Application Specification

This document is a complete, portable specification of **TaskFlow**, a lightweight team
task-tracking web application. It is written so that an engineer (or an AI agent) can
re-generate a nearly identical application from scratch without seeing the original source.
Every behavior, data shape, endpoint, default value, sort order, keyboard shortcut, color
token, and quirk described here is part of the spec — implement them exactly, including the
deliberate naming mismatch and the small known quirks called out at the end.

---

## 1. Product Overview

TaskFlow is an internal, single-team task manager. It is intentionally low-ceremony:

- **No passwords.** Users authenticate by picking their name from a list.
- Tasks are grouped under **Projects** (internally called "themes" in the database).
- Each task has an **owner**, an optional **delegate**, a **follow-up date**, an optional
  **defer-until date**, and can be linked into a **chain** of successor tasks via a
  "close and follow up" workflow.
- The primary screen is a **dashboard** that lists every project as a collapsible section with
  its open tasks inside, sorted so the most urgent work floats to the top.
- The UI is keyboard-driven, dark-themed, and refreshes itself every 30 seconds.

The target user is a small team (≈3–8 people).

### Core domain concepts

| Concept | Meaning |
|---|---|
| **User** | A team member. Role: `lead` or `member`. Soft-deactivated, never hard-deleted. |
| **Project** | A grouping of tasks (DB table `themes`, column `theme_id`). Has open/closed status. |
| **Task** | A unit of work under a project. Owner + optional delegate, dates, status. |
| **Comment** | A note attached to a task, authored by a user. |
| **Task chain** | A linked list of tasks connected by `predecessor_task_id`, created by "close & follow up". |

> **Critical naming note (must replicate):** The database calls projects **themes**
> (table `themes`, foreign key `theme_id`), but the **entire API surface and frontend use the
> word "project"**. The backend router file is named `themes.py` yet mounts under
> `/api/projects`. The frontend api module is named `themes.ts` but its functions are
> `getProjects/createProject/...`. The task serializer maps `theme_id`/`theme_name` →
> `{"project": {id, name}}`. Task create/update payloads still send the field name `theme_id`.
> This mismatch is deliberate; preserve it.

---

## 2. Technology Stack

### Backend
- **Python 3** + **FastAPI** (`fastapi>=0.115.0`)
- **uvicorn[standard]>=0.32.0**
- **python-multipart>=0.0.12**
- **SQLite** via the stdlib `sqlite3` module (no ORM). WAL journal mode, foreign keys ON.
- **Pydantic** request models (bundled with FastAPI).

### Frontend (`frontend/package.json`)
```json
{
  "name": "taskflow", "private": true, "version": "0.1.0", "type": "module",
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview" },
  "dependencies": {
    "@tanstack/react-query": "^5.62.0",
    "date-fns": "^4.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.14", "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4", "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49", "tailwindcss": "^3.4.16",
    "typescript": "^5.6.3", "vite": "^6.0.5"
  }
}
```
No test suites exist.

---

## 3. Repository Layout

```
taskflow/
├── start.sh                      # starts both servers
├── backend/
│   ├── requirements.txt
│   ├── main.py                   # FastAPI app, CORS, router registration, /health
│   ├── database.py               # schema, connection, migrations, seed
│   ├── dependencies.py           # get_current_user dependency (cookie/header auth)
│   ├── schemas.py                # Pydantic request/response models
│   ├── taskflow.db               # SQLite file (created at runtime)
│   └── routers/
│       ├── __init__.py           # empty
│       ├── session.py            # GET /api/users (list), /api/session (login/logout/whoami)
│       ├── users.py              # /api/users CRUD + /{id}/tasks
│       ├── themes.py             # /api/projects CRUD  (file named themes!)
│       ├── tasks.py              # /api/tasks CRUD + chain + close-and-follow-up
│       ├── comments.py           # /api/tasks/{id}/comments CRUD
│       └── dashboard.py          # /api/dashboard, /by-project, /by-delegate
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts            # React plugin, port 5173, proxy /api → 127.0.0.1:8000
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx               # QueryClientProvider + ToastProvider + router
        ├── index.css             # tailwind layers + component classes
        ├── types/index.ts        # shared TS interfaces
        ├── api/
        │   ├── client.ts         # request<T> + apiGet/apiPost/apiPatch/apiDelete
        │   ├── session.ts        # getUsers/login/logout/getSession
        │   ├── tasks.ts
        │   ├── themes.ts         # project API (named themes)
        │   ├── dashboard.ts
        │   ├── users.ts
        │   └── comments.ts
        ├── store/
        │   ├── authStore.ts      # zustand persisted "taskflow_user"
        │   └── filterStore.ts    # zustand persisted "taskflow_filters"
        ├── hooks/
        │   ├── useAuth.ts
        │   └── useGlobalShortcuts.ts
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── DashboardPage.tsx
        │   └── TeamSettingsPage.tsx
        └── components/
            ├── ThemeSection.tsx       # exports ProjectSection
            ├── TaskRow.tsx            # exports TaskRow, getTaskStatus, formatFollowUpDate
            ├── FilterBar.tsx
            ├── TaskDetailPanel.tsx
            ├── AddTaskModal.tsx
            ├── AddThemeModal.tsx      # exports AddProjectModal
            ├── CloseFollowUpModal.tsx
            ├── BulkActionBar.tsx
            ├── ShortcutsHelp.tsx
            └── Toast.tsx              # exports ToastProvider, useToast
```

---

## 4. Database Schema (SQLite)

DB file: `backend/taskflow.db`. On every connection:
```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
```
All timestamps default to `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` (ISO-8601 UTC, second precision).

### `users`
```sql
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    role        TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    is_active   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### `themes` (= projects)
```sql
CREATE TABLE IF NOT EXISTS themes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    description        TEXT,
    status             TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    created_by_user_id INTEGER NOT NULL,
    deleted_at         TEXT,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
```

### `tasks`
```sql
CREATE TABLE IF NOT EXISTS tasks (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id             INTEGER NOT NULL,
    title                TEXT    NOT NULL,
    description          TEXT,
    follow_up_date       TEXT,                 -- 'YYYY-MM-DD' or NULL
    completed            INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    date_entered         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    owner_id             INTEGER NOT NULL,
    delegated_to_id      INTEGER,
    predecessor_task_id  INTEGER,
    status               TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    deleted_at           TEXT,
    FOREIGN KEY (theme_id)            REFERENCES themes(id),
    FOREIGN KEY (owner_id)            REFERENCES users(id),
    FOREIGN KEY (delegated_to_id)     REFERENCES users(id),
    FOREIGN KEY (predecessor_task_id) REFERENCES tasks(id)
);
```

### `comments`
```sql
CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    deleted_at TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Migrations (additive, run at startup; no framework)
After the schema script runs, `_run_migrations(conn)` adds later columns inside try/except that
swallows the duplicate-column error:
```python
def _run_migrations(conn):
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN deferred_until TEXT")
    except Exception:
        pass  # column already exists
```
So the live `tasks` table also has **`deferred_until TEXT`** (`'YYYY-MM-DD'` or NULL). Treat it
as part of the tasks table.

### Seed data
On first init (`SELECT COUNT(*) FROM users == 0`):
```python
SEED_USERS = [
    ("You",          "you@team.local",    "lead"),
    ("Alex Rivera",  "alex@team.local",   "member"),
    ("Jordan Kim",   "jordan@team.local", "member"),
    ("Sam Torres",   "sam@team.local",    "member"),
    ("Casey Morgan", "casey@team.local",  "member"),
]
```

### Soft-delete & deactivation
- Tasks, themes, comments use a `deleted_at` timestamp; **all queries filter `deleted_at IS NULL`**.
- Users are never deleted; deactivated via `is_active = 0`.

### Connection helpers (`database.py`)
- `get_connection()` → sqlite3 connection, `row_factory = sqlite3.Row`, sets both PRAGMAs.
- `get_db()` → `@contextmanager`: yields a connection, commits on success, rolls back on
  exception, always closes.
- `init_db()` → runs schema script, runs migrations, seeds users if empty. Called from the
  FastAPI lifespan startup.

---

## 5. Backend Wiring (`main.py`)

```python
@asynccontextmanager
async def lifespan(app):
    init_db()
    yield

app = FastAPI(title="TaskFlow API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# include routers: session, users, themes, tasks, comments, dashboard
```
Also expose `GET /health` → `{"status": "ok"}`.

---

## 6. Authentication Model

No passwords, no JWTs. Identity is a user id carried two ways:

1. **Cookie** `session_user_id` — set httponly, `samesite="lax"` at login.
2. **Header** `X-User-Id` — fallback. (The frontend client sends header name `X-User-ID`;
   HTTP header names are case-insensitive so the backend's `X-User-Id` matches.)

Each protected router defines its own inline helper `_require_user(session_user_id, x_user_id)`:
- `raw = session_user_id or x_user_id` (cookie wins),
- 401 `"Not authenticated"` if neither,
- 401 `"Invalid session"` if not an int,
- returns the integer user id.

`dependencies.py` additionally defines `get_current_user(...)` which loads the user row
(requiring `is_active = 1`) and returns it as a dict, 401 if missing/inactive. (Routers mostly
use their own `_require_user`; include both.)

**Authorization specifics (these are the only real server-side rules):**
- Comment edit/delete: only the author OR a `lead` may modify (else 403).
- User deactivate: cannot deactivate yourself (403); cannot deactivate a user with open tasks (409).
- Project delete: blocked if it has open tasks (409).
- Everything else (creating users, changing roles, creating/editing tasks/projects) is open to
  any authenticated user. The Team Settings UI does **not** gate on role either.

---

## 7. Serialization Conventions

### Shared task SELECT (used by tasks list/detail and dashboard)
```sql
SELECT
    t.id, t.title, t.description, t.follow_up_date, t.completed, t.date_entered, t.status,
    t.predecessor_task_id, t.deferred_until,
    th.id as theme_id, th.name as theme_name,
    o.id as owner_id, o.name as owner_name, o.email as owner_email, o.role as owner_role,
    d.id as delegate_id, d.name as delegate_name, d.email as delegate_email, d.role as delegate_role,
    (SELECT id FROM tasks WHERE predecessor_task_id = t.id AND deleted_at IS NULL LIMIT 1) as successor_task_id
FROM tasks t
JOIN themes th ON t.theme_id = th.id
JOIN users  o  ON t.owner_id = o.id
LEFT JOIN users d ON t.delegated_to_id = d.id
```

### Task JSON
```json
{
  "id": 12, "title": "...", "description": "... or null",
  "follow_up_date": "2026-06-01 or null",
  "completed": false, "date_entered": "2026-05-31T18:00:00Z", "status": "open",
  "predecessor_task_id": null, "successor_task_id": null, "deferred_until": null,
  "project": { "id": 3, "name": "Website Redesign" },
  "owner":   { "id": 1, "name": "You", "email": "you@team.local", "role": "lead" },
  "delegated_to": null
}
```
- `completed` → real boolean. `delegated_to` is `null` unless a delegate exists (then full user
  object). `successor_task_id` = the single non-deleted task whose `predecessor_task_id` is this id.

### Project JSON
```json
{ "id": 3, "name": "...", "description": "... or null", "status": "open",
  "created_at": "...Z",
  "created_by": { "id": 1, "name": "You", "email": "...", "role": "lead" },
  "open_task_count": 7 }
```

### Comment JSON
```json
{ "id": 9, "task_id": 12, "content": "...", "created_at": "...Z",
  "user": { "id": 1, "name": "You", "email": "...", "role": "lead" } }
```

---

## 8. REST API Reference

Error bodies are FastAPI default: `{"detail": "..."}`.

### Session & user listing — `session.py` (prefix `/api`)
| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/api/users` | none | Active users (`is_active=1`), ordered by name. Fields `id,name,email,role,created_at,is_active`. |
| POST | `/api/session` | none | Body `{user_id}`. 404 if not found/inactive. Sets httponly `session_user_id` cookie (samesite=lax). Returns `{user}`. |
| DELETE | `/api/session` | — | Deletes cookie. `{ok:true}`. |
| GET | `/api/session` | cookie/header | `{user}` for current id else 401. |

### Users — `users.py` (prefix `/api/users`)
| Method | Path | Behavior |
|---|---|---|
| POST | `/api/users` | Body `{name,email,role="member"}`. 409 if email exists. Returns created user. |
| GET | `/api/users/{id}` | User or 404. |
| PATCH | `/api/users/{id}` | Body any of `{name,email,role,is_active}` (non-null applied). `is_active` bool→0/1. 400 if none. |
| DELETE | `/api/users/{id}` | Deactivate. 403 if self. 409 if user has open tasks (owner or delegate): `User has N open tasks. Reassign them first.` |
| GET | `/api/users/{id}/tasks` | Open non-deleted tasks where user is owner OR delegate. Flat rows: `id,title,follow_up_date,status,owner_id,owner_name,delegate_id,delegate_name,project_id,project_name`, ordered `follow_up_date ASC NULLS LAST`. |

### Projects — `themes.py` (prefix `/api/projects`)
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects?status=all\|open\|closed` | Non-deleted projects + `open_task_count`. Ordered `status ASC, name ASC`. Default `status=all`. (status literal interpolated only for the validated values open/closed.) |
| POST | `/api/projects` | Body `{name, description?}`. `created_by_user_id = current user`, `open_task_count=0`. |
| GET | `/api/projects/{id}` | Single + open_task_count or 404. |
| PATCH | `/api/projects/{id}` | Body any of `{name,description,status}` (non-null applied). 400 if none. |
| DELETE | `/api/projects/{id}` | 409 if open tasks: `Project has N open tasks. Close or reassign them first.` Else soft-delete. |

### Tasks — `tasks.py` (prefix `/api/tasks`)
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/tasks` | Filterable list (params below). Ordered `follow_up_date ASC NULLS LAST, date_entered DESC`. |
| POST | `/api/tasks` | Body `TaskCreate`. Validates project exists/not deleted (404 "Project not found"). Owner = current user. |
| GET | `/api/tasks/{id}` | Single non-deleted or 404. |
| PATCH | `/api/tasks/{id}` | Body `TaskUpdate`; only explicitly-set fields applied (`model_dump(exclude_unset=True)`). `completed` bool→0/1. 400 if empty. 404 if not found. |
| DELETE | `/api/tasks/{id}` | Soft-delete. 404 if gone. |
| POST | `/api/tasks/{id}/close-and-follow-up` | See below. |
| GET | `/api/tasks/{id}/chain` | See below. |

**`GET /api/tasks` query params:** `theme_id`, `owner_id`, `delegated_to_id`, `mine` (bool — if
true overrides owner/delegate filters with `(owner=me OR delegate=me)`), `status` (default
`"open"`; `"all"` disables), `due` (`"overdue"`→`follow_up_date < date('now') AND completed=0`;
`"upcoming"`→`follow_up_date BETWEEN date('now') AND date('now','+{upcoming_days} days') AND completed=0`),
`upcoming_days` (default `5`), `completed` (bool). Always filters `deleted_at IS NULL`.

**`TaskCreate`:** `{theme_id, title, description?, follow_up_date?, delegated_to_id?, predecessor_task_id?}`.
**`TaskUpdate`:** any of `{title, description, follow_up_date, owner_id, delegated_to_id, completed, status, theme_id, deferred_until}`.

**Close-and-follow-up**, body `CloseAndFollowUp` `{title, follow_up_date?, description?, delegated_to_id?}`:
1. Load task (404). 409 if already `closed`.
2. Old task → `status='closed', completed=1`.
3. Insert successor in same project, owner = current user, `predecessor_task_id = old id`,
   copying title/description/follow_up_date/delegated_to_id from body.
4. Return `{closed_task, new_task}` (both formatted).

**Chain walk** (`/chain`): 404 if missing. Walk backwards via `predecessor_task_id` (insert at
front), walk forwards via "who has me as predecessor" (`LIMIT 1` each step). Each chain item is
`{id, title, status, completed, follow_up_date, position}`; predecessors get negative positions
(`i - len(predecessors)`), current = `0`, successors `+1,+2,...`. Return `{chain, current_task_id}`.

### Comments — `comments.py` (prefix `/api/tasks`)
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/tasks/{task_id}/comments` | Non-deleted, ordered `created_at ASC`. |
| POST | `/api/tasks/{task_id}/comments` | Body `{content}`. 404 if task missing. Author = current. |
| PATCH | `/api/tasks/{task_id}/comments/{comment_id}` | Body `{content}`. 404 if missing. 403 unless author or lead. |
| DELETE | `/api/tasks/{task_id}/comments/{comment_id}` | Soft-delete. Same 403 rule. |

### Dashboard — `dashboard.py` (prefix `/api/dashboard`)

**`GET /api/dashboard`** → counts (all `status='open' AND deleted_at IS NULL`):
```json
{ "user": {"id","name","email","role"},
  "overdue_count":  "follow_up_date < today AND completed=0",
  "upcoming_count": "follow_up_date in [today, today+5d] AND completed=0",
  "open_task_count": "all open",
  "my_delegated_out_count": "owner=me AND delegated_to IS NOT NULL",
  "my_delegated_in_count":  "delegated_to=me" }
```

**`GET /api/dashboard/by-project`** (primary dashboard source) → array of
`{ project: {…with open_task_count}, tasks: [open, non-deleted only], overdue_count }`.
- Projects ordered `overdue_count DESC, status ASC, name ASC`; **all non-deleted projects are
  returned** (even empty).
- Each project's tasks ordered by 3-bucket urgency CASE: `0`=overdue, `1`=upcoming (today..+5d),
  `2`=other, then `follow_up_date ASC NULLS LAST`.

**`GET /api/dashboard/by-delegate`** → array of `{user, task_count, overdue_count, tasks}` grouped
by delegate (only delegates with ≥1 open delegated task), ordered `overdue_count DESC, task_count DESC`;
tasks ordered `follow_up_date ASC NULLS LAST`. (Endpoint and a `getDashboardByDelegate` client fn
exist; the current UI computes the delegated view client-side instead, but include the endpoint.)

---

## 9. Frontend Architecture

### Entry & routing
- `main.tsx`: mounts `<App/>` in `StrictMode`, imports `index.css`.
- `App.tsx`:
  ```tsx
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  })
  ```
  Wraps in `QueryClientProvider` → `ToastProvider` → `BrowserRouter`. A `RequireAuth` wrapper
  reads `useAuthStore().currentUser` and redirects to `/login` if absent. Routes:
  `/login` → `LoginPage`; `/` → `RequireAuth(DashboardPage)`; `/settings/team` →
  `RequireAuth(TeamSettingsPage)`; `*` → `<Navigate to="/" replace/>`.

### API client (`api/client.ts`)
- `getUserId()`: reads `localStorage['taskflow_user']`, `JSON.parse`, returns `String(user.id)`
  inside try/catch (returns null on any failure).
- `request<T>(method, path, body?, params?)`:
  - Builds `new URL(path, window.location.origin)` — i.e. **relative `/api/...` paths against the
    current origin**, relying on the **Vite dev proxy** to forward `/api` to the backend.
    There is **no `VITE_API_BASE`** env var.
  - Adds query params (skips null/undefined).
  - Headers: `{'Content-Type':'application/json'}` + `X-User-ID` if a stored id exists.
  - `credentials:'include'`, JSON-stringifies body when present.
  - On non-ok: tries `err.detail`, throws `Error(detail || 'HTTP <status>')`.
  - `204` → `undefined`; else `res.json()`.
- Exports `apiGet/apiPost/apiPatch/apiDelete`.
- Resource modules (`tasks.ts`, `themes.ts`, `dashboard.ts`, `users.ts`, `comments.ts`,
  `session.ts`) are thin typed wrappers — function names exactly as in §8 (`getTasks`,
  `createTask`, `updateTask`, `deleteTask`, `closeAndFollowUp`, `getTaskChain`, `bulkUpdate`;
  `getProjects/getProject/createProject/updateProject/deleteProject`;
  `getDashboard/getDashboardByProject/getDashboardByDelegate`;
  `getUsers/getUser/createUser/updateUser/deleteUser/getUserOpenTasks`;
  `getComments/createComment/updateComment/deleteComment`;
  `getUsers/login/logout/getSession`). `bulkUpdate(ids, data)` = `Promise.all(ids.map(updateTask))`.

### Stores (Zustand + persist)
- `authStore` (key **`taskflow_user`**): `{ currentUser: User|null, setUser(user) }`.
- `filterStore` (key **`taskflow_filters`**):
  ```ts
  view: 'all' | 'mine' | 'delegated'         // default 'all'
  due: 'all' | 'overdue' | 'upcoming'        // default 'all'
  projectId: number | null                   // default null
  searchQuery: string                        // default ''
  expandedProjects: number[]                 // default []
  showDeferred: boolean                      // default false
  showCompleted: boolean                     // default false
  delegateId: number | null                  // default null
  asOfDate: string | null                    // default null
  ```
  Setters for each, plus `toggleProject(id)` (add/remove from `expandedProjects`) and
  `setExpandedProjects(ids)`.

### Hooks
- `useAuth()` → `{ currentUser, setUser, logout }`. `logout()` calls API logout (ignoring errors),
  `setUser(null)`, navigates `/login`.
- `useGlobalShortcuts(shortcuts)` — single `document` keydown listener via a `ref` kept current
  each render. **Behavior (implement exactly):**
  - If `metaKey || ctrlKey || altKey` → return (ignore — there are no modifier shortcuts).
  - If typing in `INPUT`/`TEXTAREA`/`SELECT`/contentEditable and key ≠ `Escape` → return.
  - Look up `shortcuts[e.key]` by the raw key; if found, `preventDefault()` and call it.

### Query keys (must match)
`['users-public']` (login page only), `['users']`, `['dashboard']`,
`['dashboard','by-project']`, `['projects']`, `['tasks','completed']`, `['tasks']` (invalidation),
`['task', id]`, `['comments', id]`, `['chain', id]`. `['dashboard']`, `['dashboard','by-project']`,
and `['tasks','completed']` use `refetchInterval: 30000`.

### TypeScript interfaces (`types/index.ts`)
`User {id,name,email,role:'lead'|'member',created_at?,is_active?}`,
`Project {id,name,description?,status:'open'|'closed',created_at,created_by:User,open_task_count}`,
`Task {id,title,description?,project:{id,name},follow_up_date?,completed,date_entered,status:'open'|'closed',owner:User,delegated_to?:User,predecessor_task_id?,successor_task_id?,deferred_until?}`,
`Comment {id,task_id,user:User,content,created_at}`,
`ChainItem {id,title,status,completed,follow_up_date?,position}`,
`DashboardSummary {user,overdue_count,upcoming_count,open_task_count,my_delegated_out_count,my_delegated_in_count}`,
`ProjectWithTasks {project,tasks,overdue_count}`,
`DelegateGroup {user,task_count,overdue_count,tasks}`.

---

## 10. Pages

### LoginPage (`/login`)
- Centered `card` (`max-w-sm`) on `bg-base`. Logo line `◈ TaskFlow`, subtitle "Team Task Tracker".
- `useQuery(['users-public'], getUsers)`. Loading → "Loading...". On error show a red banner:
  "Could not connect to server. Make sure the backend is running."
- Label "Who are you?" then one button per user (name + role under it). Clicking **selects**
  (highlights accent) but does not log in.
- A `Continue →` button (disabled until a user is selected) runs the login mutation
  (`login(userId)`), then `setUser(user)` and navigates `/`. While pending shows "Signing in...".
- If `currentUser` already set, redirect to `/` (useEffect).
- Footer link "+ Add team member" → `/settings/team`.

### DashboardPage (`/`)
**Hooks rule:** all hooks run before the `if (!currentUser){ navigate('/login'); return null }`
early return; memos use `currentUser?.id ?? 0`.

`today = asOfDate ?? new Date().toISOString().slice(0,10)`.

State: `activeTaskId`, `showAddTask`, `showAddProject`, `showHelp`, `keyboardIndex` (-1),
`searchRef`, `addTaskProjectId`, `selectedIds: number[]`, `userMenuOpen`, `visibleTasksRef`.

Queries: `['dashboard']` (summary, 30s), `['dashboard','by-project']` (groups, 30s),
`['users']`, `['projects']`=`getProjects('all')`, `['tasks','completed']`=`getTasks({completed:true,
status:'all'})` **enabled only when `showCompleted`** (30s).

**Auto-expand:** on first load, if groups exist and `expandedProjects` is empty, expand all
project ids (guarded by a `hasAutoExpanded` ref).

**`filteredGroups` (useMemo)** over `projectGroups`:
1. If `projectId` set → keep only that group.
2. Per group, clone `tasks`, then:
   - if `asOfDate` → keep `date_entered.slice(0,10) <= asOfDate`;
   - `view==='mine'` → owner is me AND `delegated_to == null`;
   - `view==='delegated'` → `delegated_to != null`, and if `delegateId` set, `delegated_to.id === delegateId`;
   - if not `showDeferred` → `!deferred_until || deferred_until <= today`;
   - `due==='overdue'` → `follow_up_date && follow_up_date < today`;
   - `due==='upcoming'` → `follow_up_date` within `[today, today+5d]`;
   - if `searchQuery.trim()` → title includes query (lowercased).

**`completedByProject` (useMemo)**: only when `showCompleted`; filters `allCompletedTasks` by the
same asOf/view/delegate/search rules, then buckets into `Record<projectId, Task[]>`.

**`visibleGroups`**: in `view==='all'` keep all groups; otherwise keep groups that have ≥1 task
or (when `showCompleted`) ≥1 completed task.

**Keyboard navigation:** `visibleTasks` = flatMap of tasks from currently-expanded groups;
mirrored into `visibleTasksRef`. Arrow keys move `keyboardIndex` (clamped). A useEffect scrolls
the `[data-keyboard-focused]` element into view (`block:'nearest'`).

Shortcuts via `useGlobalShortcuts` (all the create/view ones no-op while a modal is open):
| Key | Action |
|---|---|
| `n` | open Add Task |
| `t` | open Add Project |
| `/` | focus search input |
| `1` / `2` / `3` | set view all / mine / delegated |
| `?` | open ShortcutsHelp |
| `Escape` | close help, else close detail panel (+ reset keyboardIndex) |
| `ArrowDown` / `ArrowUp` | move keyboard focus |
| `Enter` | open detail for focused task |

Layout:
- Sticky header (`bg-base`): `◈ TaskFlow`; a user-name button (`{name} ▾`) opening a dropdown
  with a single "Switch User" item (calls `logout()`); spacer; `+ Project` (ghost),
  `+ New Task` (primary), `⚙` (→ `/settings/team`), `?` (help).
- `<FilterBar projects={openProjects} users overdueCount upcomingCount searchRef/>`.
- `<BulkActionBar/>` when `selectedIds.length > 0`.
- Body row: scrollable task list (dimmed to `opacity-70` when a detail panel is open) +
  `TaskDetailPanel` on the right when `activeTaskId` set.
- Empty state (no projects at all): big `◈`, "No projects yet", "Create a project to organize
  your tasks."
- Each visible group → `<ProjectSection>`; `keyboardFocusIndex` is passed as
  `keyboardIndex - groupOffset` where `groupOffset` is the index of the group's first task within
  `visibleTasks`.
- A "Closed Projects" footer chip-list when any closed projects exist.
- Overlays: `ShortcutsHelp`, `AddProjectModal`, `AddTaskModal` (rendered conditionally).
- `handleDefer(taskId)` sets `deferred_until` to tomorrow and invalidates `['dashboard']` +
  `['task',taskId]`.

### TeamSettingsPage (`/settings/team`)
- Sticky header: `← Dashboard` (→ `/`), `◈ TaskFlow`, `/ Team`.
- "Team Members" heading + `+ Add Member` toggle. The add form is a 3-col grid (Name, Email,
  Role select member/lead) with `Add Member` (disabled until name+email) and Cancel; submits
  `createUser`, invalidates `['users']`, toasts "{name} added to team".
- Members table: columns Name / Email / Role / (Remove). Current user is tagged `★ you` and has
  no Remove button.
- **Remove flow:** clicking Remove fetches the member's open tasks (`getUserOpenTasks`) and opens
  a `RemoveMemberModal`. If the member has open tasks, you must reassign them — either "Reassign
  all to" one user, or assign each task individually to another user (excluding the member and
  yourself) — before the Remove button enables. On confirm it `bulkUpdate`s the reassignments
  (changing `owner_id`) then `deleteUser(member.id)`, invalidates `['users']` and `['dashboard']`,
  toasts "{name} removed from team".
- No role-based gating in this UI.

---

## 11. Components

### ProjectSection (`ThemeSection.tsx`, exported as `ProjectSection`)
Props: `{project, tasks, completedTasks?, overdueCount, currentUser, selectedIds, onSelect,
onView, onAddTask, onDefer?, activeTaskId?, keyboardFocusIndex=-1}`. Reads `expandedProjects` +
`toggleProject` from the store.
- Header bar (`bg-elevated/50`): a toggle button with `▼`/`▶`, uppercase project name, optional
  description (hidden on small screens), and `{open_task_count} task(s)` with, when
  `overdueCount>0`, ` · N overdue` in `text-overdue-text`.
- Inline edit: an "Edit" button swaps the header for name + description inputs (Enter saves,
  Escape cancels) calling `updateProject`; invalidates `['projects']` + `['dashboard']`.
- For open projects also: `+ Add` (→ `onAddTask(project.id)`) and `Close` (a confirm prompt
  "Close \"name\"? Tasks stay open." → `updateProject(status:'closed')`, toast).
- Closed projects render at `opacity-50`.
- When expanded: if no tasks and no completed tasks → "No tasks match filters." Otherwise render
  each open `TaskRow` wrapped in a div that, when `i === keyboardFocusIndex` and not the active
  task, gets inline style `{ background:'rgba(99,102,241,0.18)', borderLeft:'3px solid #6366f1' }`
  and a `data-keyboard-focused` attribute; the active task's wrapper gets `bg-accent/10`. Then,
  when `completedTasks` present, render those `TaskRow`s at `opacity-50` (no checkbox, no keyboard
  focus). Checkboxes only show when some task in the group is selected (`anySelected`).

### TaskRow (`TaskRow.tsx`) — also exports `getTaskStatus`, `formatFollowUpDate`
- `getTaskStatus(task)`: `normal` if no `follow_up_date` or completed; `overdue` if the date is
  before today (midnight); `upcoming` if within `[today, today+5d]`; else `normal`. (Uses date-fns
  `parseISO/isPast/isWithinInterval/addDays`.)
- `formatFollowUpDate(dateStr?)`: `'—'` if none; diff in days vs today: `<0`→`"{n}d ago"`,
  `0`→`"today"`, `≤7`→`"in {n}d"`, else `format(date, sameYear ? 'MMM d' : 'MMM d, yyyy')`.
- Row layout (flex): a selection control (a real checkbox when `showCheckbox`, else a small empty
  circle that, clicked, selects the task); a 2-char status marker (`!!` overdue / `~` upcoming /
  blank) colored accordingly; the title button (→ `onView`); badges: `Done` (green) if completed,
  `⏭ {date}` (indigo) if deferred into the future, `delegated` if delegated to someone other than
  owner; the formatted follow-up date (right, fixed width); the owner/delegate label (`me` for
  self, `→ name` when delegated); a hover-only `⏭` defer button (when `onDefer` given, "Defer to
  tomorrow"); and a `View` button.
- Overdue rows get class `task-row-overdue`, upcoming `task-row-upcoming`, else `hover:bg-elevated`.

### FilterBar (`FilterBar.tsx`)
Sticky bar (`top-14`). Reads/sets the whole filter store. Contains, left to right:
- View toggle (3 buttons in a bordered group): **All / My Tasks / Delegated** (`view`). Switching
  away from delegated clears `delegateId`. Active = accent bg + white.
- When `view==='delegated'`: a person `<select>` ("All people" + each user) → `delegateId`.
- Due `<select>`: All Dates / Overdue / Due Soon (`due` = all/overdue/upcoming).
- Project `<select>`: "All Projects" + each open project → `projectId`.
- Search `<input>` (bound to `searchQuery`; Escape clears it and blurs). `searchRef` is forwarded
  so the `/` shortcut can focus it.
- "Show deferred" checkbox (`showDeferred`) and "Show completed" checkbox (`showCompleted`).
- **As-of date navigator:** `◀` (previous weekday) / a label showing `Today` or `MMM d` (yellow
  when not today) / `▶` (next weekday, disabled at today; clamps to null when reaching today) /
  `🗓` (opens a hidden `<input type=date max=today>`) / `✕` (clears, shown only when not today).
  Weekday stepping skips Sat/Sun (`addWeekdays`). Setting a date ≥ today clears `asOfDate` to null.
- Right side: `{overdueCount} overdue` (red) and `{upcomingCount} due soon` (amber) when > 0.

### TaskDetailPanel (`TaskDetailPanel.tsx`)
An **inline right column** (`w-[26rem]`, `border-l`, `bg-surface`), not a floating overlay.
Props `{taskId, currentUser, users, onClose, onNavigate}`.
- Queries `['task',taskId]` and `['comments',taskId]` (latter enabled once task loaded). Loading →
  a narrow "Loading..." panel.
- Escape closes the panel (unless the follow-up modal is open). Panel-scoped shortcuts via
  `useGlobalShortcuts`: `c` toggle complete/reopen, `f` open Close & Follow Up (if not completed),
  `d` defer to tomorrow, `a` focus the comment box.
- Header: "Task Detail" + a transient "Saved ✓" indicator + `✕` close.
- Body:
  - A status banner (`!! OVERDUE` / `~ DUE SOON`) when not normal.
  - **Title**: a `textarea` (defaultValue = title) that PATCHes `title` on blur when changed.
  - Read-only **Project** name and **Entered** date (`MMM d, yyyy`).
  - **Owner** `<select>` over all users (current user shown as `me (name)`): choosing yourself
    PATCHes `{owner_id:me, delegated_to_id:null}`; choosing someone else PATCHes
    `{delegated_to_id:uid}`.
  - **Follow-up Date** `<input type=date>` → PATCH `follow_up_date` (undefined when cleared) on blur.
  - **ChainView** (own `['chain',taskId]` query): rendered only when `chain.length > 1`; each item
    is clickable (→ `onNavigate(id)`) with a position glyph, title (line-through if closed), and
    formatted date; the current task highlighted.
  - **Comments**: list (author, `MMM d, HH:mm`, content), then a `textarea` + `Post Comment`
    button; Cmd/Ctrl+Enter also posts. Creating invalidates `['comments',taskId]`.
- Footer actions: `✓ Mark Complete` (green) when open / `↩ Reopen Task` when completed
  (PATCH `{completed,status}`; completing closes the panel); `Close & Follow Up →` (disabled when
  closed) opens `CloseFollowUpModal`; a `DeferControl` ("⏭ Defer to Tomorrow" + a date input, or
  "Deferred until …" + "Undefer"); a `Delete Task` danger link (window.confirm → `deleteTask` →
  close). All mutations invalidate `['dashboard']`/`['tasks']`/`['task',id]` and toast.

### AddTaskModal (`AddTaskModal.tsx`)
Centered modal (`max-w-md`, dark backdrop, click-outside closes). Props `{projects, users,
currentUser, defaultProjectId?, onClose}`. Fields: **Project** select (open projects only,
default = `defaultProjectId` or first open); **Description** label over the title `textarea`
(autofocus — note the field is the task *title* but labeled "Description"); **Owner** select
(`me (name)` for self); **Follow-up Date** (default = today + 7 days, `yyyy-MM-dd`); **Initial
Comment** (optional). Submit: `createTask({theme_id, title, follow_up_date, delegated_to_id})`
where `delegated_to_id` is the owner only if it isn't the current user; if an initial comment was
typed, `createComment` on the new task. Invalidates `['dashboard']`+`['tasks']`, toast "Task
created", closes. Create button disabled unless title and project set.

### AddProjectModal (`AddThemeModal.tsx`, exported as `AddProjectModal`)
Centered modal (`max-w-sm`). Heading "New Project". Fields **Name** (autofocus; Enter submits)
and **Description** (optional). Submit `createProject({name, description||undefined})`; on success
invalidate `['projects']`+`['dashboard']`, add new project id to `expandedProjects`, toast
`Project "name" created`, close.

### CloseFollowUpModal (`CloseFollowUpModal.tsx`)
Centered modal (`max-w-sm`, `z-60`). Props `{task, users, currentUser, onClose, onSuccess}`.
Subtitle: "This task will be marked complete. A new linked task will be created." Fields: **New
task title** textarea (prefilled with `task.title`); **Owner** select (default = existing delegate
or current user); **Follow-up Date** (default today+7). Submit `closeAndFollowUp(task.id, {title,
follow_up_date, delegated_to_id})` (delegate only if not self). On success: invalidate
`['dashboard']`/`['tasks']`/`['task',id]`, show a toast "Task closed. Follow-up created." **with an
Undo action** (Undo reopens the closed task and closes the new one), call `onSuccess(new_task)`
(panel navigates to it), close.

### BulkActionBar (`BulkActionBar.tsx`)
Sticky bar (`top-[5.5rem]`, accent border). Props `{selectedIds, users, onCancel}`. Shows
`{n} selected`, a "Reassign to..." user select, a follow-up date input, an `Apply` button
(disabled unless an assignee or date chosen) and `Cancel`. Apply runs `bulkUpdate(selectedIds,
{owner_id?, follow_up_date?})`, invalidates `['dashboard']`+`['tasks']`, toasts "{n} tasks
updated", calls `onCancel`.

### ShortcutsHelp (`ShortcutsHelp.tsx`)
Centered modal grouping shortcuts: **Navigation** (↓/↑ move, Enter open, Escape close, ? help);
**Create** (n new task, t new project); **Filter** (/ focus search, 1 All, 2 My tasks, 3
Delegated); **Task panel** (c complete/reopen, f close & follow up, d defer tomorrow, a focus
comment). Footer: "Shortcuts are disabled while typing in any input field."

### Toast (`Toast.tsx`) — `ToastProvider` + `useToast`
Context exposing `showToast(message, type?='success', undo?)`. Toasts stack bottom-right; each
auto-dismisses after **3000ms** (or **5000ms** when an `undo` callback is given). Error type uses a
red style; others use `bg-elevated`. Each toast shows the message, an optional **Undo** button, and
a `✕` dismiss.

---

## 12. Styling System

Dark theme. `tailwind.config.js`:
```js
content: ['./index.html', './src/**/*.{ts,tsx}'],
theme: { extend: {
  colors: {
    base:            '#1a1a2e',
    surface:         '#252538',
    elevated:        '#2d2d42',
    border:          '#3a3a52',
    'text-primary':  '#e2e2f0',
    'text-secondary':'#9999b0',
    'text-muted':    '#666680',
    accent:          '#6366f1',
    overdue:  { bg: '#3d1515', text: '#ff6b6b' },
    upcoming: { bg: '#2e2510', text: '#ffb347' },
  },
  fontFamily: { mono: ['ui-monospace','SFMono-Regular','Menlo','monospace'] },
}}, plugins: []
```

`index.css` (`@layer base` + `@layer components`):
- base: `html { background:#1a1a2e; color:#e2e2f0 }`, `* { box-sizing:border-box }`,
  `:focus-visible` accent outline, and styled `input/textarea/select` (bg `#2d2d42`, border
  `#3a3a52`, rounded, accent focus outline) + placeholder color `#666680`.
- components: `.task-row-overdue { background:#3d1515 }`, `.task-row-upcoming { background:#2e2510 }`,
  `.btn-primary` (bg-accent, white, hover:bg-indigo-500), `.btn-secondary` (bg-elevated, border,
  hover:bg-border), `.btn-ghost` (secondary text → primary on hover, hover:bg-elevated),
  `.btn-danger` (red-400 → red-300), `.card` (bg-surface, border, rounded-lg).

`postcss.config.js`: `{ plugins: { tailwindcss:{}, autoprefixer:{} } }`.

Guidance: dynamic color values Tailwind's scanner can't see (e.g. the keyboard-focus highlight)
are applied as **inline styles**, not interpolated class names.

---

## 13. Build, Run, Config

`start.sh` (repo root) — loads nvm, then starts backend and frontend, traps Ctrl+C:
```bash
#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 "$ROOT/backend/main.py" 2>/dev/null || \
  python3 -m uvicorn main:app --reload --port 8000 --app-dir "$ROOT/backend" &
BACKEND_PID=$!
cd "$ROOT/frontend" && npm run dev &
FRONTEND_PID=$!
cleanup() { kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0; }
trap cleanup INT TERM
wait
```

Individually:
- Backend (from `backend/`): `uvicorn main:app --reload --port 8000`.
- Frontend (from `frontend/`): `npm run dev` → http://localhost:5173.
- Type check: `tsc --noEmit`. Build: `npm run build` (`tsc -b && vite build`).

`vite.config.ts`: React plugin; `server.port = 5173`; **proxy** `'/api' → { target:
'http://127.0.0.1:8000', changeOrigin: true }`. The frontend makes **relative** `/api/...` calls,
so the proxy is what reaches the backend in dev (there is no API-base env var).

`index.html`: `<div id="root">`, loads `/src/main.tsx`, title "TaskFlow".

`tsconfig.json`: strict, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
`jsx: react-jsx`, `moduleResolution: bundler`, `noEmit`, `allowImportingTsExtensions`,
`isolatedModules`, target ES2020, lib ES2020+DOM.

CORS allows `http://localhost:5173` and `http://127.0.0.1:5173` with credentials.

---

## 14. Known Quirks to Reproduce (for fidelity)

These are real behaviors of the original; replicate them rather than "fixing" them:

1. **DB "themes" vs API/UI "project"** naming mismatch throughout (table, FK, router filename,
   api module filename `themes.ts`, the `theme_id` payload field).
2. **`X-User-ID` header vs `localStorage` shape:** `client.ts` reads `JSON.parse(stored).id`, but
   zustand-persist stores `taskflow_user` as `{state:{currentUser:{…}}, version:0}` — so
   `.id` is `undefined` and the `X-User-ID` header is effectively never populated. Auth still
   works because the httponly `session_user_id` cookie carries identity. Keep both mechanisms.
3. **AddTaskModal** labels the task *title* field as "Description" and has no separate description
   field (description is left unset on create).
4. The **delegated view** is computed client-side from `by-project` data; the
   `/api/dashboard/by-delegate` endpoint exists but the dashboard doesn't call it.
5. `searchQuery` filtering matches **title only** (not description), despite the search box being
   generic.
6. There is **no role gating in the Team Settings UI**; any signed-in user can add members, change
   roles, and remove members.

## 15. Behavioral Invariants Checklist

1. Login = name pick → "Continue" → POST `/api/session` → cookie + `taskflow_user` in localStorage.
2. Projects are `themes` in the DB; tasks reference them via `theme_id`; JSON key is `project`.
3. `by-project` returns every non-deleted project (even empty); tasks bucketed overdue→upcoming→other.
4. Project list order: most overdue first, then status, then name.
5. Task list default status `open`; `status=all` removes the filter.
6. Overdue = `follow_up_date < today AND completed=0`; the upcoming window is **5 days** everywhere.
7. Close-and-follow-up closes the source (closed + completed) and creates a same-project successor
   with `predecessor_task_id`; chains walk both directions; the UI offers an Undo.
8. Soft deletes everywhere; users deactivate (`is_active=0`), can't self-deactivate, can't
   deactivate/delete with open tasks (409); can't delete a project with open tasks (409).
9. Comments editable/deletable only by author or a lead (server-enforced).
10. Filters, expanded projects, and as-of date persist (`taskflow_filters`); user persists
    (`taskflow_user`).
11. Deferred tasks hidden unless "Show deferred"; completed tasks shown only with "Show completed".
12. Keyboard shortcuts behave exactly as in §10/§11, ignored while typing (except Escape) and
    ignored entirely when a modifier key is held.
13. Dashboard summary, by-project, and completed-task queries background-refetch every 30s.
14. Exact dark color tokens (§12); keyboard focus uses an inline-styled accent highlight + left border.
15. Dev frontend talks to the backend through the Vite `/api` proxy (relative URLs, no API-base env).

---

## 16. Suggested Build Order

1. Backend: `database.py` (schema/seed/migrations), `main.py`, `dependencies.py`, `schemas.py`.
2. Routers: `session`, `users`, `themes`(projects), `tasks`, `comments`, `dashboard`. Verify via
   `/health`, then login, then `/api/dashboard/by-project`.
3. Frontend scaffold: Vite + Tailwind tokens + `index.css`; `vite.config.ts` proxy.
4. `api/client.ts` + resource modules; the two zustand stores; `types/index.ts`.
5. LoginPage + `useAuth`.
6. DashboardPage shell with the by-project query, `ProjectSection`, `TaskRow`.
7. FilterBar + the `filteredGroups`/`completedByProject` logic.
8. Modals (AddTask, AddProject, CloseFollowUp), TaskDetailPanel, BulkActionBar, ToastProvider.
9. `useGlobalShortcuts` + ShortcutsHelp.
10. TeamSettingsPage + RemoveMemberModal.
11. Verify against §14 quirks and §15 invariants.
