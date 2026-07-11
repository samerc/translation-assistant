#!/bin/bash
set -e

SERVER="samer@144.91.89.20"
REMOTE_DIR="C:/apps/translation-assistant"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSH_OPTS="-o StrictHostKeyChecking=no -o LogLevel=ERROR"

echo "========================================="
echo "  Translation Assistant — Deploy"
echo "========================================="
echo ""

# Step 1: Build
echo "[1/4] Building..."
cd "$PROJECT_DIR/backend"  && npm run build 2>&1 | tail -1
cd "$PROJECT_DIR/frontend" && NEXT_PUBLIC_API_URL="https://translate.fancyshark.com/api" npm run build 2>&1 | tail -1

# Step 2: Package (exclude node_modules — they stay on server)
echo "[2/4] Packaging..."
cd "$PROJECT_DIR"
tar czf /tmp/ta-backend.tar.gz  -C backend  dist package.json package-lock.json
tar czf /tmp/ta-frontend.tar.gz -C frontend .next/standalone .next/static
echo "  Backend: $(du -h /tmp/ta-backend.tar.gz | cut -f1), Frontend: $(du -h /tmp/ta-frontend.tar.gz | cut -f1)"

# Step 3: Upload
echo "[3/4] Uploading..."
scp $SSH_OPTS /tmp/ta-backend.tar.gz  "$SERVER:$REMOTE_DIR/backend-deploy.tar.gz"  2>/dev/null
scp $SSH_OPTS /tmp/ta-frontend.tar.gz "$SERVER:$REMOTE_DIR/frontend-deploy.tar.gz" 2>/dev/null
echo "  Upload complete"

# Step 4: Extract, install deps if needed, copy static, restart ONLY our apps
echo "[4/4] Deploying on server..."
ssh $SSH_OPTS "$SERVER" "cd $REMOTE_DIR && tar xzf backend-deploy.tar.gz -C backend && tar xzf frontend-deploy.tar.gz -C frontend && del backend-deploy.tar.gz frontend-deploy.tar.gz 2>nul && xcopy /E /I /Y frontend\.next\static frontend\.next\standalone\frontend\.next\static >nul 2>&1 && cd backend && npm install --omit=dev --prefer-offline 2>&1 && cd .. && pm2 restart ta-backend ta-frontend --update-env 2>&1 && pm2 save 2>&1 && echo DEPLOY_OK" 2>&1 | grep -E "DEPLOY_OK|added|up to date|restarted|error|Error" | head -5

echo ""
echo "========================================="
echo "  Deploy complete!"
echo "  http://translate.fancyshark.com"
echo "========================================="
