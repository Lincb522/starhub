import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { syncRepositoryAvailability } from "./repo-availability.mjs";

const GITHUB_API = "https://api.github.com";

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github.star+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "star-hub-star-sync",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function listUserStarredRepos(login, token) {
  const stars = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(
      `${GITHUB_API}/users/${encodeURIComponent(login)}/starred?sort=created&direction=desc&per_page=100&page=${page}`,
      { headers: githubHeaders(token), signal: AbortSignal.timeout(20_000) },
    );
    if (response.status === 404) throw new Error(`${login} 的 GitHub 用户暂不可访问，已保留原记录`);
    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const reason = remaining === "0" ? "GitHub API 额度已用完" : `GitHub API ${response.status}`;
      throw new Error(`${login} 的 Star 列表获取失败：${reason}`);
    }

    const rows = await response.json();
    for (const row of rows) {
      const fullName = row.repo?.full_name ?? row.full_name;
      const id = row.repo?.id ?? row.id;
      if (!fullName || !Number.isSafeInteger(id) || id <= 0) throw new Error('GitHub 返回的 Star 列表无效，已保留原记录');
      stars.push({ githubId: String(id), fullName, starredAt: typeof row.starred_at === "string" ? row.starred_at : null });
    }
    if (rows.length < 100) return stars;
  }
  throw new Error(`${login} 的 Star 列表超过同步上限，未改动站内记录`);
}

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function syncGitHubStarRecords({ databasePath, repoFullNames, token = process.env.GITHUB_TOKEN, dryRun = false }) {
  if (!databasePath) throw new Error("缺少数据库路径，请传 --db=/path/to/starhub.db 或设置 DATABASE_PATH");
  if (!existsSync(databasePath)) throw new Error(`数据库不存在：${databasePath}`);

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout = 10000;");
  db.exec("PRAGMA foreign_keys = ON;");
  if (!db.prepare("PRAGMA table_info(stars)").all().some((column) => column.name === "mutation_version")) {
    db.exec("ALTER TABLE stars ADD COLUMN mutation_version INTEGER NOT NULL DEFAULT 0");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, synced_at TEXT NOT NULL)`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS received_star_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      star_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      seen_at TEXT,
      UNIQUE(recipient_id, star_user_id, repo_id)
    );
    CREATE INDEX IF NOT EXISTS idx_received_star_notifications_unseen
      ON received_star_notifications(recipient_id, seen_at);
  `);
  try {
    const users = db.prepare(`SELECT id, login FROM users ORDER BY id`).all();
    const allRepos = db.prepare(`SELECT id, full_name FROM repos ORDER BY id`).all();
    const requested = repoFullNames?.length
      ? new Set(repoFullNames.map((fullName) => fullName.toLowerCase()))
      : null;
    const repos = requested ? allRepos.filter((repo) => requested.has(repo.full_name.toLowerCase())) : allRepos;
    if (repos.length === 0) {
      return { dryRun, users: users.length, repos: 0, added: 0, removed: 0, total: 0 };
    }

    const placeholders = repos.map(() => "?").join(",");
    const readCurrent = () => db.prepare(
      `SELECT id, user_id, repo_id, mutation_version FROM stars WHERE repo_id IN (${placeholders})`,
    ).all(...repos.map((repo) => repo.id));
    const versions = new Map(readCurrent().map((row) => [row.id, row.mutation_version]));
    const availability = await syncRepositoryAvailability(db, { token, dryRun, repoIds: repos.map((repo) => Number(repo.id)) });
    const repoIds = new Map(availability.identities.map((repo) => [repo.githubId, repo.repoId]));
    const renamedOwners = new Map(availability.identities.map((repo) => [repo.ownerId, repo.owner]));
    const currentUsers = users.map((user) => ({ ...user, login: renamedOwners.get(user.id) ?? user.login }));
    const snapshots = await mapWithConcurrency(currentUsers, 4, async (user) => ({
      user,
      stars: await listUserStarredRepos(user.login, token),
    }));
    const verified = new Set(availability.verifiedRepoIds);
    // 仓库的 GitHub owner id 与本站用户 id 同源；再加上录入者，用于排除「自己 Star 自己的仓库」
    const ownerIdByRepo = new Map(availability.identities.map((repo) => [Number(repo.repoId), repo.ownerId]));
    const submitterByRepo = new Map(db.prepare(`SELECT id, submitter_id FROM repos`).all()
      .map((row) => [Number(row.id), row.submitter_id]));
    const actual = new Map();
    for (const { user, stars } of snapshots) {
      for (const star of stars) {
        const repoId = repoIds.get(star.githubId);
        if (!repoId || !verified.has(Number(repoId))) continue;
        // 自己 Star 自己的仓库不算互点，不写入本站记录（与 src/lib/github-star-sync.ts 保持一致）
        if (ownerIdByRepo.get(Number(repoId)) === user.id || submitterByRepo.get(Number(repoId)) === user.id) continue;
        actual.set(`${user.id}:${repoId}`, { userId: user.id, repoId, starredAt: star.starredAt });
      }
    }

    if (!dryRun) db.exec("BEGIN IMMEDIATE");
    if (!dryRun) {
      const available = new Set(db.prepare('SELECT id FROM repos WHERE is_available = 1').all().map((row) => Number(row.id)));
      for (const id of verified) if (!available.has(id)) verified.delete(id);
      for (const [key, row] of actual) if (!verified.has(Number(row.repoId))) actual.delete(key);
    }
    const current = readCurrent();
    const currentKeys = new Set(current.map((entry) => `${entry.user_id}:${entry.repo_id}`));
    // Keep writes made after the remote read began, including reconfirmed existing stars.
    const changed = new Set(current.filter((row) => versions.get(row.id) !== row.mutation_version)
      .map((row) => `${row.user_id}:${row.repo_id}`));
    for (const row of current) {
      if (!verified.has(Number(row.repo_id))) changed.add(`${row.user_id}:${row.repo_id}`);
    }
    const added = [...actual.keys()].filter((key) => !currentKeys.has(key)).length;
    const removed = [...currentKeys].filter((key) => !actual.has(key) && !changed.has(key)).length;

    if (!dryRun) {
      const removeNotification = db.prepare(
        `DELETE FROM received_star_notifications WHERE star_user_id = ? AND repo_id = ?`,
      );
      const remove = db.prepare(`DELETE FROM stars WHERE user_id = ? AND repo_id = ?`);
      const insert = db.prepare(`INSERT OR IGNORE INTO stars (user_id, repo_id) VALUES (?, ?)`);
      const insertWithTime = db.prepare(
        `INSERT INTO stars (user_id, repo_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id, repo_id) DO UPDATE SET created_at = excluded.created_at`,
      );
      const insertNotification = db.prepare(
        `INSERT OR IGNORE INTO received_star_notifications (recipient_id, star_user_id, repo_id)
         SELECT submitter_id, ?, id FROM repos WHERE id = ? AND submitter_id <> ?`,
      );

      try {
        for (const row of current) {
          if (changed.has(`${row.user_id}:${row.repo_id}`)) continue;
          if (actual.has(`${row.user_id}:${row.repo_id}`)) continue;
          removeNotification.run(row.user_id, row.repo_id);
          remove.run(row.user_id, row.repo_id);
        }
        for (const entry of actual.values()) {
          if (changed.has(`${entry.userId}:${entry.repoId}`)) continue;
          if (entry.starredAt) insertWithTime.run(entry.userId, entry.repoId, entry.starredAt);
          else insert.run(entry.userId, entry.repoId);
          insertNotification.run(entry.userId, entry.repoId, entry.userId);
        }
        if (!requested && availability.errors.length === 0) {
          db.prepare(
            `INSERT INTO sync_state (key, synced_at) VALUES ('github-stars:all-users', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
             ON CONFLICT(key) DO UPDATE SET synced_at = excluded.synced_at`,
          ).run();
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }

    return { dryRun, users: users.length, repos: repos.length, added, removed, total: current.length + added - removed,
      availability: { checked: availability.checked, unavailable: availability.unavailable, restored: availability.restored, errors: availability.errors,
        // 仅在发生时附加，保持无事发生时的输出结构不变
        ...(availability.purged?.length ? { purged: availability.purged } : {}),
        ...(availability.purgeSkipped ? { purgeSkipped: availability.purgeSkipped } : {}) } };
  } finally {
    db.close();
  }
}
