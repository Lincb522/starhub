#!/usr/bin/env bash
# 部署到服务器：rsync 源码 -> 服务器上 npm ci + build -> 切换 current -> 重启服务
# 用法：DEPLOY_HOST=<ssh 主机别名> scripts/deploy.sh
set -euo pipefail

HOST="${DEPLOY_HOST:?请通过环境变量 DEPLOY_HOST 指定 ssh 主机}"
APP_DIR="${APP_DIR:-/opt/starhub}"
APP_USER="${APP_USER:-starhub}"
SERVICE="starhub"
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)"
REL_DIR="$APP_DIR/releases/$RELEASE"

cd "$(dirname "$0")/.."

echo "==> 同步源码到 $HOST:$REL_DIR"
ssh "$HOST" "mkdir -p '$REL_DIR'"
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude .next --exclude data \
  --exclude '.env*' --exclude tsconfig.tsbuildinfo --exclude '*.log' \
  ./ "$HOST:$REL_DIR/"

echo "==> 服务器端安装依赖、构建"
ssh "$HOST" bash -s "$REL_DIR" "$APP_DIR" "$APP_USER" "$SERVICE" <<'REMOTE'
set -euo pipefail
REL_DIR="$1"; APP_DIR="$2"; APP_USER="$3"; SERVICE="$4"

cd "$REL_DIR"
ln -sfn "$APP_DIR/shared/.env" .env

npm ci --no-audit --no-fund --loglevel=error
NODE_ENV=production npm run build --silent

# 构建阶段会以 root 打开一次数据库，把属主还给服务用户
chown -R "$APP_USER:$APP_USER" "$REL_DIR" "$APP_DIR/shared/data"
ln -sfn "$REL_DIR" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"

systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" && echo "服务已启动" || { journalctl -u "$SERVICE" -n 30 --no-pager; exit 1; }

# 安装或刷新飞书仓库同步定时器；脚本本身会立即执行一次幂等同步
if [ -f "$APP_DIR/current/scripts/install-feishu-sync.sh" ]; then
  bash "$APP_DIR/current/scripts/install-feishu-sync.sh"
fi

# 只保留最近 3 个版本
cd "$APP_DIR/releases" && ls -1t | tail -n +4 | xargs -r rm -rf
REMOTE

echo "==> 完成"
