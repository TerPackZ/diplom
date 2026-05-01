#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=============================="
echo "  TaskTracker — Production"
echo "=============================="

# Create .env for backend if it doesn't exist
if [ ! -f backend/.env ]; then
  echo ""
  echo "[0/4] Creating backend/.env with random JWT_SECRET..."
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 64)
  cat > backend/.env <<EOF
PORT=3001
JWT_SECRET=${JWT_SECRET}
EOF
  echo "  backend/.env created."
fi

# Load .env so PORT is available for the startup message
set -a
# shellcheck disable=SC1091
[ -f backend/.env ] && . backend/.env
set +a

# Install backend dependencies
echo ""
echo "[1/4] Installing backend dependencies..."
(cd backend && npm install 2>&1 | tail -3)

# Install frontend dependencies
echo ""
echo "[2/4] Installing frontend dependencies..."
(cd frontend && npm install 2>&1 | tail -3)
chmod +x frontend/node_modules/.bin/* 2>/dev/null || true
chmod +x backend/node_modules/.bin/* 2>/dev/null || true
# Fix esbuild native binary permissions (required on some Linux environments)
find frontend/node_modules -name "esbuild" -type f -exec chmod +x {} \; 2>/dev/null || true

# Build frontend
echo ""
echo "[3/4] Building frontend..."
(cd frontend && npx tsc -b && npx vite build)

# Build backend
echo ""
echo "[4/4] Building backend..."
(cd backend && npx tsc)

# Start
echo ""
echo "=============================="
echo "  Starting server on port ${PORT:-3001}..."
echo "  Access at: http://$(hostname -I | awk '{print $1}'):${PORT:-3001}"
echo "=============================="
echo ""

cd backend && exec node dist/index.js
