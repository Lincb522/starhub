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
  <a href="#贡献榜">贡献榜</a>
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

StarHub 是面向小型开发者社群的互 Star 站。成员用 GitHub 登录，登记自己的公开仓库，浏览其他成员的项目并 Star；站内记录每一次 Star 的双向关系，以及仓库在 GitHub 上的实时状态。Star 通过成员本人的 OAuth 授权逐个发出。

## 浏览与 Star

登录后默认进入卡片视图，每个用户只占一张卡片，默认展示其一个仓库；展开「选择项目」可以切换到该用户的其他仓库。给这个用户的任一仓库 Star 后，他就不再出现在待 Star 队列中。卡片展示所属用户的头像与小红书名、仓库简介、语言、GitHub 上的 Star 数，以及站内已 Star 过它的成员。键盘 `Enter`、空格或 `S` 执行 Star，`→` 跳过当前用户，`O` 在 GitHub 打开。未 Star 的用户排在前面，其中被 Star 人数少的仓库优先出现。

对方已 Star 过你的仓库时，卡片标注「对方已 Star 你」；你 Star 之后变为「已互 Star」。

网格视图列出全部仓库，可按仓库名、语言或小红书名搜索，按未 Star、已 Star、我的筛选。按用户视图将仓库按所属用户分组，进入某个成员可查看其名下的全部仓库。自己的仓库不出现在「全部」列表中。

## 记录

记录页分四部分。「我未回 Star」列出 Star 过你的仓库、而你尚未 Star 对方的成员，每行附「去回 Star」入口，直达对方的仓库列表；「对方未 Star 我」与「已互 Star」按用户去重；「收到的 Star」保留每次仓库 Star 的完整记录。

有成员新 Star 了你的仓库，下次打开站点会显示提醒卡片，附对方登记的仓库地址。

## 数据与 GitHub 保持一致

站内 Star 记录以 GitHub 为准。登录用户打开页面时，后台拉取其在 GitHub 上的完整 Star 列表与本地比对，补齐缺失记录，删除已在 GitHub 取消的记录。页面不等待这个过程，先以现有数据渲染。

仓库按 GitHub 的数字 ID 追踪，改名或转移后 Star 记录保留。仓库 owner 或录入人对自己仓库的 Star 不计入互 Star 关系。

每 5 分钟从 GitHub 刷新所有仓库的 Star 数、简介与语言。GitHub 返回 404 或仓库已转私有的，先在站内隐藏；连续 72 小时仍处于该状态才连同 Star 记录一起删除。网络错误、限流与 5xx 不改变状态。单轮失效数量超过阈值时（通常是 token 失效）跳过删除。

## 录入方式

站内录入：粘贴 GitHub 链接或 `owner/repo`，简介、语言与 Star 数自动补齐。

飞书表格：表格设为「链接可访问」，地址填入 `FEISHU_REPO_SHEET_URL`，服务器每 5 分钟读取新增行并按 `owner/repo` 去重。表格需包含「仓库地址」与「小红书」两列，不需要飞书应用凭证。

批量导入：`node scripts/import-repos.mjs --input=members.json`，输入为 `{ xhsName, repo }` 数组。

## 本地运行

需要 Node.js 22.5 及以上（使用内置的 `node:sqlite`）。

```bash
git clone https://github.com/Lincb522/starhub.git
cd starhub
npm install
cp .env.example .env
```

到 <https://github.com/settings/developers> 新建一个 OAuth App，Homepage 填 `http://localhost:3000`，回调填 `http://localhost:3000/api/auth/callback/github`，把 Client ID 和 Secret 写进 `.env`，再用 `npx auth secret` 生成 `AUTH_SECRET`。

```bash
npm run dev      # http://localhost:3000
npm run seed     # 可选，写入演示数据
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
| `GITHUB_TOKEN` | 服务端定时任务用的 PAT，classic 类型，`public_repo` 权限即可 |
| `AUTH_URL` · `AUTH_TRUST_HOST` | 线上部署时填站点地址 |
| `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` | 服务器访问 GitHub 不稳定时让进程走代理 |

## 部署

SQLite 需要持久磁盘，Vercel 这类平台不适用。`scripts/` 里是我们线上在用的 systemd 加 nginx 部署脚本。

```bash
# 首次：建用户、目录、.env、systemd 服务、nginx 站点，需要 root
ssh your-server 'DOMAIN=star.example.com bash -s' < scripts/server-setup.sh

# 发布：rsync 源码，服务器上 npm ci 和 build，切换目录，重启服务
DEPLOY_HOST=your-server scripts/deploy.sh
```

`server-setup.sh` 中的证书路径需替换为自己的。前置反代节点时传入 `EDGE_IP=x.x.x.x`，nginx 会信任它转发过来的真实 IP。上线后将 OAuth App 的回调地址改为正式域名。

## 开发

```bash
npm run lint
npm run test:feishu          # 飞书表格解析
npm run test:repo-deck       # 卡片排序和筛选
npm run test:github-stars    # Star 对账、改名追踪、失效处理、并发
```

测试使用 Node 内置的 `node --test`，不依赖网络。

```
src/app/        页面和 Server Actions
src/components/ 卡片、网格、记录页、提醒
src/lib/        db.ts（SQLite）、github.ts、github-star-sync.ts、queries.ts
scripts/        飞书同步、Star 对账、批量导入、部署脚本，lib/ 下是可复用逻辑和测试
```

## 贡献榜

感谢每一位参与 StarHub 的开发者。贡献者头像由 [contrib.rocks](https://contrib.rocks) 根据 GitHub 贡献记录生成，点击可查看完整贡献榜。

<a href="https://github.com/Lincb522/starhub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Lincb522/starhub" alt="StarHub 贡献者头像">
</a>

欢迎通过 [Issues](https://github.com/Lincb522/starhub/issues) 反馈问题，或提交 [Pull Request](https://github.com/Lincb522/starhub/pulls) 参与改进。

---

**开发者：ZIJIU522** · MIT 许可证
