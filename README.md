<div align="center">
  <h1>StarHub</h1>
  <p><b>给小型 GitHub 社群用的互 Star 站。</b></p>
  <p>GitHub 登录，录入自己的公开仓库，逐个翻看其他成员的项目并 Star；谁 Star 了谁、谁还没回，都有记录</p>
  <p>
    <img src="https://img.shields.io/badge/Next.js-16-202126?logo=nextdotjs&amp;logoColor=white" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/Node.js-22.5%2B-535966?logo=node.js&amp;logoColor=white" alt="Node.js 22.5 及以上" />
    <img src="https://img.shields.io/badge/数据库-SQLite_单文件-596be9" alt="SQLite 单文件" />
    <img src="https://img.shields.io/badge/许可证-MIT-3c3f4a" alt="MIT" />
  </p>
  <p><a href="https://star.zijiu522.cn">线上实例</a> &nbsp; · &nbsp; <a href="https://github.com/Lincb522/starhub/issues">反馈问题</a></p>
  <br />
  <img src="assets/home.png" width="420" alt="首页" />
  &nbsp;&nbsp;
  <img src="assets/repos.png" width="420" alt="全部仓库" />
</div>

> Star 只在用户点击时执行，每次一个仓库，用用户自己的 OAuth 授权调用 GitHub API。没有批量按钮，没有后台代点。GitHub 的 [Acceptable Use Policies](https://docs.github.com/site-policy/acceptable-use-policies/github-acceptable-use-policies) 把有组织的刷 Star 视为不真实互动，会清理并可能处罚账号。这个站的用途是让成员看清彼此的仓库，点不点由人决定。

StarHub 用 Next.js 写成，状态全部放在一个 SQLite 文件里，没有外部数据库。成员的 Star 状态以 GitHub 为准，本地记录只是缓存。

## 浏览与 Star

| 视图 | 说明 |
| :--- | :--- |
| 翻卡片 | 一次一个仓库。`Enter` / 空格 / `S` Star，`→` 跳过，`O` 打开 GitHub。未 Star 的排前面，其中被 Star 人数少的先出现 |
| 全部仓库 | 网格。按仓库名、语言、小红书名搜索；筛选未 Star / 已 Star / 我的；自己的仓库不出现在列表里 |
| 按用户 | 按录入人分组，点进去看这个人录入的全部仓库 |

卡片上显示录入人的 GitHub 头像与小红书名、语言、GitHub 上的 Star 数，以及站内有哪些人 Star 过。对方 Star 过你的仓库时，卡片上标「对方已 Star 你」；你也 Star 回去后变成「已互 Star」。

## 记录

| 区块 | 内容 |
| :--- | :--- |
| 我未回 Star | 对方 Star 了我的仓库、我还没 Star 对方的。每行一个「去回 Star」按钮，直达对方录入的仓库 |
| 对方未 Star 我 | 我 Star 了对方、对方还没回 |
| 已互 Star | 双向都有 |
| 收到的 Star | 我录入的仓库被谁 Star 了 |

有人 Star 了你的仓库，下次打开站点会弹一张卡片，列出对方的仓库地址。

## 数据怎么保持真实

| 机制 | 说明 |
| :--- | :--- |
| Star 对账 | 登录用户打开页面时，后台拉取他在 GitHub 上的完整 Star 列表与本地比对，多的补、少的删。页面不等这个过程，先用已有数据渲染 |
| 仓库改名 | 按 GitHub 仓库的数字 ID 追踪，改名或转移后 Star 记录不丢 |
| 自 Star 不计 | 仓库 owner 或录入人 Star 自己的仓库，不进入任何互 Star 关系 |
| 实时 Star 数 | 每 5 分钟从 GitHub 刷新每个仓库的 Star 数、简介、语言 |
| 失效仓库清理 | GitHub 明确返回 404 或转私有的仓库先隐藏；连续 72 小时仍失效才连同 Star 记录一起删除。单轮失效数量异常时（多半是 token 出问题）跳过删除。网络错误、限流、5xx 不改状态 |

## 录入方式

| 方式 | 说明 |
| :--- | :--- |
| 站内录入 | 贴 GitHub 链接或 `owner/repo`，自动取简介、语言、Star 数 |
| 飞书表格同步 | 群里维护一张公开的飞书 Wiki 表格，服务器每 5 分钟录入新增行，按 `owner/repo` 去重。表格需要「仓库地址」和「小红书」两列，设为链接可访问即可，不需要飞书应用凭证 |
| 批量导入 | `node scripts/import-repos.mjs --input=members.json`，输入为 `{ xhsName, repo }` 数组 |

## 本地运行

需要 Node.js 22.5 及以上（`node:sqlite` 从这个版本开始内置）。

```bash
git clone https://github.com/Lincb522/starhub.git
cd starhub
npm install
cp .env.example .env
```

在 <https://github.com/settings/developers> 新建一个 OAuth App，Homepage 填 `http://localhost:3000`，回调填 `http://localhost:3000/api/auth/callback/github`，把 Client ID / Secret 写进 `.env`。再执行 `npx auth secret` 生成 `AUTH_SECRET`。

```bash
npm run dev      # http://localhost:3000
npm run seed     # 可选：灌一些演示数据
```

## 配置

| 变量 | 说明 |
| :--- | :--- |
| `DATABASE_PATH` | SQLite 文件路径，默认 `./data/starhub.db` |
| `AUTH_SECRET` · `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` | Auth.js 与 GitHub OAuth App，必填 |
| `INVITE_CODE` | 群口令。设置后新用户先输口令才能录入 |
| `ADMIN_LOGINS` | 管理员 GitHub 用户名，逗号分隔。可删任意仓库、不受口令限制 |
| `REPO_PURGE_GRACE_HOURS` | 失效仓库删除的宽限期，默认 `72`，`0` 关闭 |
| `FEISHU_REPO_SHEET_URL` | 飞书表格地址，设置后启用同步 |
| `GITHUB_TOKEN` | 服务端定时任务用的 PAT（classic，`public_repo` 即可） |
| `AUTH_URL` · `AUTH_TRUST_HOST` | 线上部署时的站点地址 |
| `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` | 服务器访问 GitHub 不稳时，让本进程走代理 |

## 部署

需要持久磁盘放 SQLite，Vercel 这类无状态平台不适用。`scripts/` 里是我们线上在用的 systemd + nginx 部署脚本：

```bash
# 首次：建用户、目录、.env、systemd 服务、nginx 站点（需要 root）
ssh your-server 'DOMAIN=star.example.com bash -s' < scripts/server-setup.sh

# 每次发布：rsync 源码 → 服务器上 npm ci + build → 原子切换 → 重启 → 刷新飞书同步定时器
DEPLOY_HOST=your-server scripts/deploy.sh
```

`server-setup.sh` 里的证书引用换成你自己的路径。前面有反代节点时传 `EDGE_IP=x.x.x.x`，nginx 会信任它转发的真实 IP。线上记得把 OAuth App 的回调地址改成正式域名。

## 开发

```bash
npm run lint
npm run test:feishu          # 飞书表格解析
npm run test:repo-deck       # 卡片排序与筛选
npm run test:github-stars    # Star 对账、改名追踪、失效处理、并发
```

测试用 Node 自带的 `node --test`，不连外部服务。

```
src/app/        页面与 Server Actions
src/components/ 卡片、网格、记录页、提醒
src/lib/        db.ts（SQLite）· github.ts · github-star-sync.ts · queries.ts
scripts/        飞书同步、Star 对账、批量导入、部署脚本；lib/ 下是可复用逻辑与测试
```

---

**开发者：ZIJIU522** · MIT 许可证
