# StarHub

给小型 GitHub 社群用的互 Star 站。成员用 GitHub 登录，录入自己的公开仓库，一张一张翻别人的仓库，看中了按一下 Star。谁 Star 了谁、谁还没回，都记着。

线上实例：<https://star.zijiu522.cn>

## 它解决什么

一个几十人的群里互相 Star 仓库，用群聊接龙很快就乱了：不知道谁给自己点过、自己漏了谁、链接是不是已经失效。StarHub 把这件事收成一个页面：

- **翻卡片**：单仓库大卡片，`Enter` / `S` Star，`→` / 空格 跳过，`O` 去 GitHub。按"已被 Star 的人数"升序排，冷门的先出现。
- **全部仓库**：网格视图，按仓库名、语言、小红书名搜索；筛选未 Star / 已 Star / 我的；也可以按用户分组浏览。
- **记录页**：我 Star 过的、我收到的、已互 Star 的；单独列出"对方还没回我"和"我还没回对方"，后者带一个直达对方仓库的按钮。
- **收到 Star 的提醒**：有人 Star 了你，下次打开会弹卡片，附上对方录入的仓库地址，方便回礼。
- **Star 状态以 GitHub 为准**：定时从 GitHub 拉取真实的 Star 列表对账，本地记录只是缓存。在 GitHub 上取消 Star，这里也会消失。
- **失效仓库自动清理**：仓库被删或转私有后先隐藏，连续 72 小时确认失效才删除记录；单轮失效比例异常（通常是 token 出问题）时不删。
- **飞书表格同步**（可选）：群里维护一张公开的飞书表格，每 5 分钟把新增的仓库自动录入。

### 关于自动化的边界

Star 只在用户点击时执行，每次一个仓库，用用户自己的 OAuth 授权调 GitHub API。没有批量按钮、没有后台代点、没有代理账号。GitHub 的 [Acceptable Use Policies](https://docs.github.com/site-policy/acceptable-use-policies/github-acceptable-use-policies) 把有组织的刷 Star 视为不真实互动，会定期清理并可能处罚账号——这个项目的定位是帮成员看清楚彼此的仓库，而不是替他们点。

## 技术栈

Next.js 16（App Router、Server Actions）· React 19 · Tailwind CSS 4 · Auth.js v5 · Node 内置 `node:sqlite`

没有 ORM，没有外部数据库，一个 SQLite 文件就是全部状态。

## 本地运行

需要 Node.js ≥ 22.5（`node:sqlite` 从这个版本开始内置）。

```bash
git clone https://github.com/Lincb522/starhub.git
cd starhub
npm install
cp .env.example .env
```

### 1. 建一个 GitHub OAuth App

<https://github.com/settings/developers> → New OAuth App：

| 字段 | 值 |
| --- | --- |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/callback/github` |

把 Client ID / Client Secret 填进 `.env` 的 `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`。申请的 scope 是 `read:user user:email public_repo`，其中 `public_repo` 是 Star 操作的最小权限。

### 2. 生成 Auth.js 密钥

```bash
npx auth secret      # 或 openssl rand -base64 32
```

填进 `AUTH_SECRET`。

### 3. 启动

```bash
npm run dev
npm run seed         # 可选：灌一些演示数据看效果
```

打开 <http://localhost:3000>。

## 配置项

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `DATABASE_PATH` | SQLite 文件路径，目录需存在 | `./data/starhub.db` |
| `AUTH_SECRET` | Auth.js 加密密钥 | 必填 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth App | 必填 |
| `INVITE_CODE` | 群口令。设置后新用户要先输入口令才能录入 | 空，不限制 |
| `ADMIN_LOGINS` | 管理员 GitHub 用户名，逗号分隔。可删任意仓库、不受口令限制 | 空 |
| `REPO_PURGE_GRACE_HOURS` | 失效仓库自动删除的宽限期（小时），`0` 关闭 | `72` |
| `FEISHU_REPO_SHEET_URL` | 公开飞书 Wiki 表格地址，设置后启用自动录入 | 空，不同步 |
| `GITHUB_TOKEN` | 服务端对账用的 PAT（classic，`public_repo` 即可）。不设则用登录用户的 token | 空 |
| `AUTH_URL` / `AUTH_TRUST_HOST` | 线上部署时的站点地址，见下 | — |
| `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` | 服务器访问 GitHub 不稳时让本进程走代理 | — |

## 部署

任何能跑 Node 的地方都可以，但要有持久磁盘放 SQLite（Vercel 之类的无状态平台不合适）。

```bash
npm run build
npm start
```

线上额外设置：

```env
AUTH_URL="https://star.example.com"
AUTH_TRUST_HOST=true
DATABASE_PATH="/var/lib/starhub/starhub.db"
```

并把 OAuth App 的回调地址改成 `https://star.example.com/api/auth/callback/github`。

### 用自带脚本部署到 VPS

`scripts/` 里有一套针对 systemd + nginx 的脚本，我们线上就是这样跑的：

```bash
# 首次：建用户、目录、.env、systemd 服务、nginx 站点（需要 root）
ssh your-server 'DOMAIN=star.example.com bash -s' < scripts/server-setup.sh

# 之后每次发布：rsync 源码 → 服务器上 npm ci + build → 原子切换 current → 重启
DEPLOY_HOST=your-server scripts/deploy.sh
```

`server-setup.sh` 默认引用 `/etc/nginx/recovered-wildcard-ssl.conf` 作为证书配置，换成你自己的证书路径即可。如果前面有海外反代节点，传 `EDGE_IP=x.x.x.x` 让 nginx 信任它转发的真实 IP。

### 飞书表格同步

表格需要有一列仓库地址（表头可以是「仓库地址」「GitHub 地址」等）和一列小红书名（「小红书」「小红书账号」等），第一行是表头。表格设为"互联网上获得链接的人可访问"即可，不需要飞书应用凭证。

```bash
npm run sync:feishu                          # 读取 FEISHU_REPO_SHEET_URL，只录入新增，按 owner/repo 去重
node scripts/sync-feishu-repos.mjs --dry-run # 只看会录入什么，不写库
```

`deploy.sh` 会自动安装一个每 5 分钟跑一次的 systemd timer（`scripts/install-feishu-sync.sh`）。同一次运行还会顺带做仓库可用性检查和 Star 对账。

## 数据是怎么保持真实的

- **Star 对账**：登录用户打开页面时，后台异步拉取他在 GitHub 上的完整 Star 列表，与本地记录比对：GitHub 上有、本地没有的补上；本地有、GitHub 上没有的删掉。页面不等待这个过程，用已有数据先渲染。
- **仓库改名 / 迁移**：按 GitHub 仓库的数字 ID 追踪，改名后 Star 记录不丢。
- **自己给自己的 Star 不算**：仓库的 owner 或录入人 Star 自己的仓库，不计入任何"互 Star"关系。
- **失效判定很保守**：只有 GitHub 明确返回 404 或 `private: true` 才算失效；网络错误、限流、5xx 都不改状态。

## 开发

```bash
npm run lint
npm run test:feishu          # 飞书表格解析
npm run test:repo-deck       # 卡片排序 / 筛选
npm run test:github-stars    # Star 对账、改名追踪、失效处理、并发
```

测试用 Node 自带的 `node --test`，不依赖外部服务。

## 目录

```
src/
  auth.ts                       Auth.js 配置
  app/
    page.tsx                    首页（游客介绍 / 成员概览）
    start/  join/  login/       登录引导、口令、登录
    repos/page.tsx              翻卡片 / 网格 / 按用户
    submit/page.tsx             录入与管理我的仓库
    history/page.tsx            记录页
    actions.ts                  Server Actions：录入、Star、删除、加入
  components/                   卡片、网格、记录、提醒等 UI
  lib/
    db.ts                       SQLite 建表、迁移、查询
    github.ts                   GitHub API 封装
    github-star-sync.ts         后台 Star 对账（单飞、失败退避）
    queries.ts                  排序 / 筛选
scripts/
  lib/                          可复用的同步逻辑与测试
  sync-feishu-repos.mjs         飞书同步入口
  sync-github-stars.mjs         手动触发 Star 对账
  deploy.sh  server-setup.sh    部署
```

## 许可证

MIT
