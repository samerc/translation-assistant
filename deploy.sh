#!/bin/bash
set -e

SERVER="samer@144.91.89.20"
REMOTE_DIR="C:/apps/translation-assistant"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Translation Assistant Deploy ==="
echo ""

# Step 1: Build backend
echo "[1/5] Building backend..."
cd "$PROJECT_DIR/backend"
npm run build 2>&1 | tail -1

# Step 2: Build frontend (standalone)
echo "[2/5] Building frontend..."
cd "$PROJECT_DIR/frontend"
NEXT_PUBLIC_API_URL="http://translate.fancyshark.com/api" npm run build 2>&1 | tail -3

# Step 3: Create tarballs
echo "[3/5] Packaging..."
cd "$PROJECT_DIR"
tar czf /tmp/ta-backend.tar.gz -C backend dist package.json package-lock.json
tar czf /tmp/ta-frontend.tar.gz -C frontend .next/standalone .next/static

# Step 4: Upload and extract
echo "[4/5] Uploading to server..."
scp /tmp/ta-backend.tar.gz "$SERVER:$REMOTE_DIR/backend-deploy.tar.gz" 2>/dev/null
scp /tmp/ta-frontend.tar.gz "$SERVER:$REMOTE_DIR/frontend-deploy.tar.gz" 2>/dev/null

echo "[5/5] Deploying on server..."
ssh "$SERVER" "cd $REMOTE_DIR && tar xzf backend-deploy.tar.gz -C backend && tar xzf frontend-deploy.tar.gz -C frontend && del backend-deploy.tar.gz frontend-deploy.tar.gz 2>nul && powershell -Command \"Copy-Item -Recurse -Force 'C:\apps\translation-assistant\frontend\.next\static' 'C:\apps\translation-assistant\frontend\.next\standalone\frontend\.next\static'\" && pm2 restart ta-backend ta-frontend && pm2 save" 2>&1 | grep -v WARNING | grep -v "store now" | grep -v "may need"

echo ""
echo "=== Deploy complete! ==="
echo "App: http://translate.fancyshark.com"
echo ""
