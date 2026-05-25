import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "taskflow.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    role        TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

CREATE TABLE IF NOT EXISTS tasks (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id             INTEGER NOT NULL,
    title                TEXT    NOT NULL,
    description          TEXT,
    follow_up_date       TEXT,
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
"""

SEED_USERS = [
    ("You", "you@team.local", "lead"),
    ("Alex Rivera", "alex@team.local", "member"),
    ("Jordan Kim", "jordan@team.local", "member"),
    ("Sam Torres", "sam@team.local", "member"),
    ("Casey Morgan", "casey@team.local", "member"),
]


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _run_migrations(conn: sqlite3.Connection):
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN deferred_until TEXT")
    except Exception:
        pass  # column already exists


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)
        _run_migrations(conn)
        row = conn.execute("SELECT COUNT(*) FROM users").fetchone()
        if row[0] == 0:
            conn.executemany(
                "INSERT INTO users (name, email, role) VALUES (?, ?, ?)",
                SEED_USERS,
            )
