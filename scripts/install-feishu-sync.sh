#!/usr/bin/env bash
# 安装飞书仓库自动同步：每 5 分钟读取公开表格并幂等录入新增仓库
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/starhub}"
APP_USER="${APP_USER:-starhub}"
SERVICE="starhub-feishu-sync.service"
TIMER="starhub-feishu-sync.timer"

# 表格地址从 $APP_DIR/shared/.env 的 FEISHU_REPO_SHEET_URL 读取（unit 通过 EnvironmentFile 加载）
if ! grep -q '^FEISHU_REPO_SHEET_URL=' "$APP_DIR/shared/.env" 2>/dev/null; then
  echo "请先在 $APP_DIR/shared/.env 中设置 FEISHU_REPO_SHEET_URL" >&2
  exit 1
fi

cat > "/etc/systemd/system/$SERVICE" <<EOF
[Unit]
Description=StarHub Feishu repository sync
After=network-online.target
Wants=network-online.target
ConditionPathExists=$APP_DIR/shared/data/starhub.db

[Service]
Type=oneshot
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/current
EnvironmentFile=$APP_DIR/shared/.env
ExecStart=/usr/bin/node $APP_DIR/current/scripts/sync-feishu-repos.mjs --db=$APP_DIR/shared/data/starhub.db
TimeoutStartSec=120
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR/shared/data
EOF

cat > "/etc/systemd/system/$TIMER" <<EOF
[Unit]
Description=Run StarHub Feishu repository sync every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30s
Persistent=true
Unit=$SERVICE

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "$TIMER" >/dev/null
systemctl start "$SERVICE"
systemctl is-active --quiet "$TIMER"
echo "飞书自动同步已启用：每 5 分钟检查一次"
