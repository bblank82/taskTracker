# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Start both servers (recommended):**
```bash
./start.sh
```

**Or start individually:**
```bash
# Backend (from backend/): uvicorn main:app --reload --port 8000
# Frontend (from frontend/): npm run dev   → http://localhost:5173
```

**Type check frontend:**
```bash
cd frontend && ~/.nvm/versions/node/v22.22.2/bin/node node_modules/.bin/tsc --noEmit
```

**Build frontend:**
```bash
cd frontend && npm run build
```

Node is installed via nvm; the active version is at `~/.nvm/versions/node/v22.22.2/bin/`. There are no backend tests and no frontend tests.

## Architecture

### Backend — FastAPI + SQLite

`backend/` is a single-file-per-router FastAPI app. Routers live in `backend/routers/` and are registered in `main.py`. The database is `backend/taskflow.db` (WAL mode, foreign keys on).

**Auth pattern:** No passwords. Users select themselves from a name-picker on the login page. Session is stored as an httponly cookie `session_user_id`. All protected endpoints also accept an `X-User-Id` header as a fallback. The `_require_user()` helper in each router enforces this.

**Schema note — naming mismatch:** The DB table is `themes` and the column is `theme_id`, but all API routes and frontend code use the word "project". The backend router file is still named `routers/themes.py` but its prefix is `/api/projects`. `_format_task()` in both `tasks.py` and `dashboard.py` maps `theme_id`/`theme_name` → `"project": {id, name}`.

**Migrations:** Additive-only, run at startup in `database._run_migrations()` using try/except to skip already-applied columns. No migration framework.

**Task chains:** A task can have a `predecessor_task_id`. The "close and follow up" action (`POST /api/tasks/{id}/close-and-follow-up`) closes the current task and creates a successor, forming a linked chain. `GET /api/tasks/{id}/chain` walks the chain in both directions.

**Soft deletes:** Tasks and themes have `deleted_at`. All queries filter `deleted_at IS NULL`. Users are deactivated via `is_active = 0`, not deleted.

**Dashboard endpoints:**
- `GET /api/dashboard` — summary counts (overdue, upcoming, open total, delegation counts)
- `GET /api/dashboard/by-project` — all open projects with their open tasks, ordered by overdue count then project name. This is the primary data source for the dashboard view.

### Frontend — React + Vite + TypeScript

Stack: React 18, React Router v6, TanStack Query v5, Zustand v5, Tailwind CSS v3.

**Pages:** `LoginPage` (name picker), `DashboardPage` (main view), `TeamSettingsPage` (`/settings/team`).

**State management:**
- `authStore` (Zustand, persisted as `taskflow_user`) — `currentUser: User | null`
- `filterStore` (Zustand, persisted as `taskflow_filters`) — view mode, filters, expanded project IDs, as-of date. Persisted so filters survive page reload.

**Data fetching:** TanStack Query with a 30s refetch interval on dashboard queries. Query keys: `['dashboard']`, `['dashboard', 'by-project']`, `['projects']`, `['users']`, `['tasks', 'completed']`, `['task', id]`.

**Dashboard data flow:** `getDashboardByProject()` fetches all projects + their open tasks in one call. `DashboardPage` applies all filtering client-side (view mode, due date, search, deferred, as-of date) in `filteredGroups` useMemo. Completed tasks are fetched separately and merged per-project.

**Keyboard navigation:** Global shortcuts are registered in `useGlobalShortcuts` (single `document` keydown listener using a ref to always have the latest handler map). Arrow keys update `keyboardIndex` state; the index is passed as `keyboardFocusIndex` to `ProjectSection`, which applies an inline style (`borderLeft + background`) to the focused task row. `visibleTasksRef` is a ref updated synchronously during render to give the stable `navigate_kb` callback access to the current task list without stale closures.

**Important hooks rule:** All hooks in `DashboardPage` must be called before the `if (!currentUser) return null` early return. The three `useMemo` hooks (`filteredGroups`, `completedByProject`, `visibleTasks`) use `currentUser?.id ?? 0` to handle the (never-in-practice) null case.

**Styling:** Dark theme with custom Tailwind tokens (`base`, `surface`, `elevated`, `border`, `text-primary`, `text-secondary`, `text-muted`, `accent`). Reusable component classes (`btn-primary`, `btn-ghost`, `btn-secondary`, `card`) are defined in `index.css`. Dynamic classes that Tailwind might not detect should use inline styles instead of computed class strings.

**As-of date:** The filter bar has a date navigator that lets users browse the task list as it appeared on past weekdays. When `asOfDate` is set, tasks are filtered by `date_entered <= asOfDate`.

## AWS Hosting Options

The main architectural constraint is **SQLite**: it's a local file, so any hosting approach must either keep it on a persistent local disk or replace it with a network database.

### Option A — Single EC2 instance (simplest, recommended for small teams)

Run everything on one instance (t3.small ~$15/mo). nginx serves the Vite static build and proxies `/api/*` to uvicorn.

- SQLite `.db` file lives on an EBS volume (mounted at e.g. `/data`). Change `DB_PATH` in `database.py` to point there.
- Zero code changes required beyond the DB path.
- Deploy: `npm run build`, rsync `frontend/dist/` and `backend/` to the instance, restart uvicorn (systemd or supervisord).
- CORS: update `allow_origins` in `main.py` to the EC2 domain or IP.
- Auth cookies work as-is (same origin via nginx proxy).

**nginx config sketch:**
```nginx
server {
    listen 80;
    root /var/www/taskflow;          # frontend/dist
    index index.html;
    location /api/ { proxy_pass http://127.0.0.1:8000; }
    location / { try_files $uri /index.html; }
}
```

### Option B — S3 + CloudFront (frontend) + EC2 (backend)

- `npm run build` → upload `frontend/dist/` to S3 → serve via CloudFront.
- Backend still on EC2 with EBS-backed SQLite, behind an ALB or direct.
- CloudFront needs a cache behavior that forwards `/api/*` to the ALB origin.
- **CORS changes required:** `allow_origins` must include the CloudFront domain. Session cookies need `SameSite=None; Secure` since frontend and API are now cross-origin. Change `set_cookie` in `session.py`.
- Frontend API calls must point to the backend domain (set `VITE_API_BASE` and prefix all `fetch` calls).

### Option C — Containers (ECS Fargate or App Runner) + EFS or RDS

Use when you want zero server management or need horizontal scaling.

**SQLite on EFS:** Mount an EFS filesystem into the container at the DB path. SQLite WAL mode works on NFS but with some caveats (file locking). Suitable for low-concurrency use.

**Migrate to PostgreSQL (RDS/Aurora Serverless):** Bigger change but cleaner for containers. Required changes:
- Replace `sqlite3` with `psycopg2` (or `asyncpg` + `databases`)
- Replace `?` placeholders with `%s`
- Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`
- Replace SQLite's `strftime` defaults with `NOW()` / `CURRENT_TIMESTAMP`
- `_run_migrations()` pattern can stay; replace `ALTER TABLE ... ADD COLUMN` try/except with `IF NOT EXISTS` syntax

**App Runner** is the lowest-ops container option: point it at a Dockerfile, it handles scaling and TLS. Pair with RDS Aurora Serverless v2 for the DB.

### Option D — Lightsail

AWS Lightsail gives a pre-configured Linux instance with a fixed monthly price ($7–12/mo). Functionally the same as Option A but with a simpler console and built-in snapshot backups. Good choice if EC2 feels like overkill to manage.
