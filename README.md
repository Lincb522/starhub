<p align="center">
  <img src="assets/icon.svg" width="120" height="120" alt="StarHub">
</p>

<h1 align="center">StarHub</h1>

<p align="center">GitHub · Star · 小型社群</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-1F2328?style=flat-square&logo=nextdotjs&logoColor=white">
  <img alt="Node.js 22.5+" src="https://img.shields.io/badge/Node.js-22.5%2B-555555?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/storage-SQLite-FF5D48?style=flat-square&logo=sqlite&logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-2DA44E?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://star.zijiu522.cn">线上实例</a>
  ·
  <a href="#本地运行">本地运行</a>
  ·
  <a href="#部署">部署</a>
  ·
  <a href="https://github.com/Lincb522/starhub/issues">Issues</a>
</p>

<table>
  <tr>
    <td colspan="2" align="center"><img src="assets/home.png" alt="首页"><br><sub><b>首页</b></sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="assets/repos.png" alt="全部仓库"><br><sub><b>全部仓库</b></sub></td>
    <td width="50%" align="center"><img src="assets/users.png" alt="按用户浏览"><br><sub><b>按用户浏览</b></sub></td>
  </tr>
</table>

StarHub 是一个给小群体用的互 Star 站。群里的人用 GitHub 账号登录，把自己的公开仓库登记进来，然后一张一张翻别人的仓库，看得上就点 Star。谁 Star 了谁、谁还欠着没回，站里都记着。

## 为什么做这个

我们有一个几十人的小红书博主群，大家都在做开源项目，互相 Star 是群里长期的惯例。以前靠一张飞书表格登记，谁 Star 过谁全凭记忆，新人进群要翻几十行链接一个个点开，老成员也说不清自己还差谁没回。

StarHub 就是把这张表格搬成一个网站。登记还是那张表，但浏览、Star、对账、提醒都在站里完成。Star 这个动作本身没有变：每次一个仓库，用你自己的 GitHub 授权发出请求，站里没有批量按钮，也不会在后台替你点。GitHub 的 [Acceptable Use Policies](https://docs.github.com/site-policy/acceptable-use-policies/github-acceptable-use-policies) 不允许有组织地刷 Star，我们不想让任何人的账号因为这个出问题。

## 翻仓库

登录以后默认进入翻卡片模式，一屏一个仓库，显示录入人的头像和小红书名、仓库简介、语言、GitHub 上的 Star 数，以及站内已经有哪些人 Star 过它。键盘上 `Enter`、空格或 `S` 是 Star，`→` 跳过，`O` 在 GitHub 打开。排序上先出你还没 Star 的，同样没 Star 的里面被 Star 人数少的排前面，这样冷门项目不会一直沉在底下。

如果对方之前 Star 过你的仓库，卡片上会标「对方已 Star 你」，你 Star 回去以后变成「已互 Star」。

不想一张张翻，可以切到网格视图看全部仓库，按仓库名、语言或小红书名搜索，也可以只看未 Star、已 Star 或自己的。还有一个按用户的视图，把仓库按录入人归组，点进某个人能看到他登记的全部仓库。你自己的仓库不会出现在「全部」里，避免自己给自己点。

## 记录页

记录页分四块。「我未回 Star」列出 Star 过你、但你还没 Star 回去的人，每行有一个「去回 Star」按钮，直接跳到那个人的仓库列表。「对方未 Star 我」是反过来的情况。「已互 Star」和「收到的 Star」是流水。

有人新 Star 了你的仓库，你下次打开站点会看到一张提醒卡片，上面带着对方登记的仓库地址，方便直接回礼。

## 数据以 GitHub 为准

站内的 Star 记录只是缓存，真相在 GitHub。登录用户每次打开页面，后台会拉取他在 GitHub 上的完整 Star 列表和本地比对，本地缺的补上，GitHub 上已经取消的删掉。这个过程不阻塞页面，你先看到的是已有数据，几秒后刷新就是对账后的结果。

仓库按 GitHub 的数字 ID 追踪，改名或转移到别的账号下，Star 记录不会丢。仓库 owner 或录入人给自己的仓库点的 Star 不计入任何互 Star 关系。

每 5 分钟会从 GitHub 刷新一次所有仓库的 Star 数、简介和语言。同一轮检查里，GitHub 明确返回 404 或者仓库已转私有的，先在站内隐藏；如果连续 72 小时都是这个状态，才连同它的 Star 记录一起删除。网络错误、限流和 5xx 不改变状态。一轮里失效数量异常多的时候（通常是 token 出了问题），这轮跳过删除。

## 三种录入方式

在站内贴一个 GitHub 链接或 `owner/repo`，简介、语言、Star 数会自动补齐。

也可以继续用飞书表格。表格设为「链接可访问」，把地址填进 `FEISHU_REPO_SHEET_URL`，服务器每 5 分钟读一次，把新增的行录进来，按 `owner/repo` 去重。表格里需要有「仓库地址」和「小红书」两列，不需要申请飞书应用凭证。

批量导入用 `node scripts/import-repos.mjs --input=members.json`，输入是一个 `{ xhsName, repo }` 数组。

## 本地运行

需要 Node.js 22.5 或更新，因为用了内置的 `node:sqlite`。

```bash
git clone https://github.com/Lincb522/starhub.git
cd starhub
npm install
cp .env.example .env
```

到 <https://github.com/settings/developers> 新建一个 OAuth App，Homepage 填 `http://localhost:3000`，回调填 `http://localhost:3000/api/auth/callback/github`，把 Client ID 和 Secret 写进 `.env`，再用 `npx auth secret` 生成 `AUTH_SECRET`。

```bash
npm run dev      # http://localhost:3000
npm run seed     # 可选，灌一些演示数据
```

## 配置项

| 变量 | 说明 |
| :--- | :--- |
| `DATABASE_PATH` | SQLite 文件路径，默认 `./data/starhub.db` |
| `AUTH_SECRET` · `AUTH_GITHUB_ID` · `AUTH_GITHUB_SECRET` | Auth.js 和 GitHub OAuth App，必填 |
| `INVITE_CODE` | 群口令。设置后新用户要先输口令才能录入 |
| `ADMIN_LOGINS` | 管理员的 GitHub 用户名，逗号分隔。可以删任何仓库，不受口令限制 |
| `REPO_PURGE_GRACE_HOURS` | 失效仓库多久后删除，默认 `72`，填 `0` 关闭自动删除 |
| `FEISHU_REPO_SHEET_URL` | 飞书表格地址，填了就启用同步 |
| `GITHUB_TOKEN` | 服务端定时任务用的 PAT，classic 类型，`public_repo` 权限够用 |
| `AUTH_URL` · `AUTH_TRUST_HOST` | 线上部署时填站点地址 |
| `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` | 服务器访问 GitHub 不稳定时让进程走代理 |

## 部署

SQLite 需要一块持久磁盘，Vercel 这类平台不适用。`scripts/` 里是我们线上在用的 systemd 加 nginx 部署脚本。

```bash
# 首次：建用户、目录、.env、systemd 服务、nginx 站点，需要 root
ssh your-server 'DOMAIN=star.example.com bash -s' < scripts/server-setup.sh

# 发布：rsync 源码，服务器上 npm ci 和 build，切换目录，重启服务
DEPLOY_HOST=your-server scripts/deploy.sh
```

`server-setup.sh` 里的证书路径要换成你自己的。前面有反代节点的话传 `EDGE_IP=x.x.x.x`，nginx 会信任它转发过来的真实 IP。上线后记得把 OAuth App 的回调地址改成正式域名。

## 开发

```bash
npm run lint
npm run test:feishu          # 飞书表格解析
npm run test:repo-deck       # 卡片排序和筛选
npm run test:github-stars    # Star 对账、改名追踪、失效处理、并发
```

测试用 Node 自带的 `node --test`，不需要联网。

```
src/app/        页面和 Server Actions
src/components/ 卡片、网格、记录页、提醒
src/lib/        db.ts（SQLite）、github.ts、github-star-sync.ts、queries.ts
scripts/        飞书同步、Star 对账、批量导入、部署脚本，lib/ 下是可复用逻辑和测试
```

---

**开发者：ZIJIU522** · MIT 许可证
