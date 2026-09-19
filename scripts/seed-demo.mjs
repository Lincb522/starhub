// 开发调试用：写入几条演示数据。用法：node scripts/seed-demo.mjs
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const path = resolve(process.cwd(), process.env.DATABASE_PATH || "./data/starhub.db");
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);

const users = [
  ["demo-1", "octocat", "The Octocat", "https://avatars.githubusercontent.com/u/583231?v=4", "章鱼猫写代码"],
  ["demo-2", "torvalds", "Linus Torvalds", "https://avatars.githubusercontent.com/u/1024025?v=4", "内核老林"],
  ["demo-3", "gaearon", "Dan Abramov", "https://avatars.githubusercontent.com/u/810438?v=4", "Dan的前端日记"],
  ["demo-4", "sindresorhus", "Sindre Sorhus", "https://avatars.githubusercontent.com/u/170270?v=4", null],
];
const repos = [
  ["octocat/Hello-World", "octocat", "Hello-World", "My first repository on GitHub!", null, 2900, "demo-1"],
  ["torvalds/linux", "torvalds", "linux", "Linux kernel source tree", "C", 190000, "demo-2"],
  ["gaearon/overreacted.io", "gaearon", "overreacted.io", "Personal blog by Dan Abramov.", "JavaScript", 7000, "demo-3"],
  ["sindresorhus/awesome", "sindresorhus", "awesome", "😎 Awesome lists about all kinds of interesting topics", "Markdown", 340000, "demo-4"],
  ["sindresorhus/got", "sindresorhus", "got", "🌐 Human-friendly and powerful HTTP request library for Node.js", "TypeScript", 14000, "demo-4"],
];

const cols = db.prepare(`PRAGMA table_info(users)`).all();
if (!cols.some((c) => c.name === "xhs_name")) db.exec("ALTER TABLE users ADD COLUMN xhs_name TEXT");

const insUser = db.prepare(
  `INSERT INTO users (id, login, name, avatar_url, xhs_name, approved) VALUES (?, ?, ?, ?, ?, 1)
   ON CONFLICT(id) DO UPDATE SET xhs_name = COALESCE(users.xhs_name, excluded.xhs_name)`,
);
const insRepo = db.prepare(
  `INSERT OR IGNORE INTO repos (full_name, owner, name, description, language, stargazers, html_url, submitter_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insStar = db.prepare(`INSERT OR IGNORE INTO stars (user_id, repo_id) VALUES (?, (SELECT id FROM repos WHERE full_name = ?))`);

db.exec("BEGIN");
for (const u of users) insUser.run(...u);
for (const r of repos) insRepo.run(r[0], r[1], r[2], r[3], r[4], r[5], `https://github.com/${r[0]}`, r[6]);
insStar.run("demo-2", "octocat/Hello-World");
insStar.run("demo-3", "octocat/Hello-World");
insStar.run("demo-4", "octocat/Hello-World");
insStar.run("demo-1", "torvalds/linux");
insStar.run("demo-3", "torvalds/linux");
insStar.run("demo-1", "gaearon/overreacted.io");
insStar.run("demo-2", "sindresorhus/awesome");
db.exec("COMMIT");

console.log(`Seeded demo data into ${path}`);
