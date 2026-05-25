#!/bin/bash
# Start both backend and frontend for TaskFlow

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting TaskFlow backend on http://localhost:8000"
python3 "$ROOT/backend/main.py" 2>/dev/null || \
  python3 -m uvicorn main:app --reload --port 8000 --app-dir "$ROOT/backend" &
BACKEND_PID=$!

echo "Starting TaskFlow frontend on http://localhost:5173"
cd "$ROOT/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both."

cleanup() {
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM
wait
