#!/usr/bin/env bash
# 首次初始化服务器（只需跑一次）：建用户、目录、.env、systemd、nginx
# 用法：DOMAIN=star.example.com ssh your-server 'DOMAIN=star.example.com bash -s' < scripts/server-setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/starhub}"
APP_USER="${APP_USER:-starhub}"
PORT="${PORT:-4320}"
DOMAIN="${DOMAIN:?请通过环境变量 DOMAIN 指定站点域名}"
# 可选：海外反代节点 IP。设置后 nginx 信任它转发的 X-Forwarded-For，日志和应用拿到真实客户端 IP
EDGE_IP="${EDGE_IP:-}"

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/releases" "$APP_DIR/shared/data"

if [ ! -f "$APP_DIR/shared/.env" ]; then
  cat > "$APP_DIR/shared/.env" <<EOF
NODE_ENV=production
DATABASE_PATH=$APP_DIR/shared/data/starhub.db
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=https://$DOMAIN
AUTH_TRUST_HOST=true
AUTH_GITHUB_ID=__FILL__
AUTH_GITHUB_SECRET=__FILL__
INVITE_CODE=
ADMIN_LOGINS=
EOF
  chmod 600 "$APP_DIR/shared/.env"
  echo "已生成 $APP_DIR/shared/.env，请填入 AUTH_GITHUB_ID / AUTH_GITHUB_SECRET"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR/shared"

cat > /etc/systemd/system/starhub.service <<EOF
[Unit]
Description=StarHub
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/current
EnvironmentFile=$APP_DIR/shared/.env
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port $PORT
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/conf.d/$DOMAIN.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;
    include /etc/nginx/recovered-wildcard-ssl.conf;

    client_max_body_size 5m;

$( [ -n "$EDGE_IP" ] && printf '    # 信任海外反代节点转发的真实客户端 IP\n    set_real_ip_from %s;\n    real_ip_header X-Forwarded-For;\n    real_ip_recursive on;\n' "$EDGE_IP" )

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

systemctl daemon-reload
systemctl enable starhub >/dev/null 2>&1 || true
nginx -t && systemctl reload nginx
echo "初始化完成：$APP_DIR，端口 $PORT，域名 $DOMAIN"
