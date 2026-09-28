#!/usr/bin/env bash
set -e

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================================"
echo "          SERVERCONSOLE LOCAL LAUNCHER (BASH)               "
echo "============================================================"
echo ""

mkdir -p logs data

# 1. Node check
echo -n "[1/7] Checking Node.js ................. "
if ! command -v node &> /dev/null; then
    echo "[FAILED]"
    echo "Node.js is not installed. Please install Node v20+ or v22+."
    exit 1
fi
echo "[$(node -v)]"

# 2. npm check
echo -n "[2/7] Checking npm ..................... "
if ! command -v npm &> /dev/null; then
    echo "[FAILED]"
    echo "npm is not installed."
    exit 1
fi
echo "[v$(npm -v)]"

# 3. Dependencies
echo -n "[3/7] Verifying workspace packages ..... "
if [ ! -d "node_modules" ]; then
    echo "(installing dependencies...)"
    npm install --silent
fi
if [ ! -d "packages/shared/dist" ] || [ ! -d "apps/server/dist" ]; then
    npm run build --workspace=@server-console/shared --silent
    npm run build --workspace=@server-console/server --silent
fi
echo "[OK]"

# 4. Environment
echo -n "[4/7] Checking .env configuration ...... "
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
fi
echo "[OK]"

# Track PIDs
MOCK_PID=""
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "Stopping ServerConsole processes..."
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
    rm -f logs/pids.json
    echo "ServerConsole stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 5. Start Mock Servers
echo -n "[5/7] Starting mock VNC & SSH servers .. "
(cd apps/server && node dist/mock/runner.js) > logs/mock-servers.log 2>&1 &
MOCK_PID=$!
sleep 1
echo "[PID $MOCK_PID]"

# 6. Start Backend
echo -n "[6/7] Starting backend server .......... "
(cd apps/server && node dist/index.js) > logs/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend health check
BACKEND_READY=0
for i in {1..30}; do
    if curl -s http://127.0.0.1:3001/api/health | grep -q "ok"; then
        BACKEND_READY=1
        break
    fi
    sleep 0.5
done

if [ $BACKEND_READY -eq 1 ]; then
    echo "[Port 3001]"
else
    echo "[FAILED]"
    echo "Backend failed to start. Last log entries:"
    tail -n 15 logs/backend.log
    exit 1
fi

# 7. Start Frontend
echo -n "[7/7] Starting frontend web client ..... "
(cd apps/web && npx vite --host 0.0.0.0 --port 5173) > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

FRONTEND_READY=0
for i in {1..30}; do
    if curl -s http://127.0.0.1:5173 > /dev/null; then
        FRONTEND_READY=1
        break
    fi
    sleep 0.5
done

if [ $FRONTEND_READY -eq 1 ]; then
    echo "[Port 5173]"
else
    echo "[FAILED]"
    echo "Frontend failed to start. Last log entries:"
    tail -n 15 logs/frontend.log
    exit 1
fi

echo "{\"startedAt\":\"$(date)\",\"backendPid\":$BACKEND_PID,\"frontendPid\":$FRONTEND_PID,\"mockServersPid\":$MOCK_PID}" > logs/pids.json

echo ""
echo "============================================================"
echo "                 SERVERCONSOLE IS READY!                    "
echo "============================================================"
echo ""
echo "  Web Console:       http://localhost:5173"
echo "  Backend API:       http://localhost:3001"
echo "  API Health:        http://localhost:3001/api/health"
echo "  Mock VNC Desktop:  127.0.0.1:5901 (No Auth)"
echo "  Mock SSH / SFTP:   127.0.0.1:2222 (User: admin, Pass: admin)"
echo "  Log Directory:     $SCRIPT_DIR/logs"
echo ""
echo "============================================================"

# Open browser
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:5173" 2>/dev/null &
elif command -v open &> /dev/null; then
    open "http://localhost:5173" 2>/dev/null &
fi

echo "ServerConsole is running. Press [Ctrl+C] to stop all services."
wait
