import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ensureRepositoryAvailabilitySchema, updateRepositoryIdentity } from "../../scripts/lib/repo-availability.mjs";
import type { GitHubRepo } from "./github";

export type User = {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  xhsName: string | null;
  approved: boolean;
  isAdmin: boolean;
  createdAt: string;
};

export type Repo = {
  id: number;
  githubId: string | null;
  isAvailable: boolean;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  htmlUrl: string;
  submitterId: string;
  /** 仓库 GitHub owner 对应的本站用户 id；owner 是组织或未注册成员时为 null */
  ownerUserId: string | null;
  createdAt: string;
};

export type UserBrief = { id: string; login: string; avatarUrl: string | null; xhsName: string | null };

export { repoPersonId } from "../../scripts/lib/repo-person.mjs";

export type RepoWithStars = Repo & {
  submitter: UserBrief;
  person: UserBrief;
  stars: { user: UserBrief; createdAt: string }[];
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT,
  stargazers INTEGER NOT NULL DEFAULT 0,
  html_url TEXT NOT NULL,
  submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS stars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, repo_id)
);
CREATE INDEX IF NOT EXISTS idx_stars_repo ON stars(repo_id);
CREATE INDEX IF NOT EXISTS idx_stars_user ON stars(user_id);
CREATE INDEX IF NOT EXISTS idx_repos_submitter ON repos(submitter_id);
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
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  synced_at TEXT NOT NULL
);
`;

// 增量字段：老库没有的列在这里补上
const MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "users", column: "xhs_name", ddl: "ALTER TABLE users ADD COLUMN xhs_name TEXT" },
  { table: "stars", column: "mutation_version", ddl: "ALTER TABLE stars ADD COLUMN mutation_version INTEGER NOT NULL DEFAULT 0" },
];

function migrate(db: DatabaseSync) {
  ensureRepositoryAvailabilitySchema(db);
  for (const m of MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${m.table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === m.column)) db.exec(m.ddl);
  }

  db.prepare(
    `INSERT OR IGNORE INTO received_star_notifications (recipient_id, star_user_id, repo_id)
     SELECT r.submitter_id, s.user_id, s.repo_id
     FROM stars s JOIN repos r ON r.id = s.repo_id
     WHERE r.submitter_id <> s.user_id`,
  ).run();
}

function open(): DatabaseSync {
  const path = resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH || "./data/starhub.db");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 10000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

const g = globalThis as unknown as { __starhubDb?: DatabaseSync };
export const db: DatabaseSync = g.__starhubDb ?? (g.__starhubDb = open());

/* ---------- row mappers ---------- */

type UserRow = {
  id: string;
  login: string;
  name: string | null;
  avatar_url: string | null;
  xhs_name: string | null;
  approved: number;
  is_admin: number;
  created_at: string;
};
type RepoRow = {
  id: number;
  github_id: string | null;
  is_available: number;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  html_url: string;
  submitter_id: string;
  created_at: string;
  s_login: string;
  s_avatar: string | null;
  s_xhs: string | null;
  owner_user_id: string | null;
  owner_login: string | null;
  owner_avatar: string | null;
  owner_xhs: string | null;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  login: r.login,
  name: r.name,
  avatarUrl: r.avatar_url,
  xhsName: r.xhs_name,
  approved: r.approved === 1,
  isAdmin: r.is_admin === 1,
  createdAt: r.created_at,
});

const toRepo = (r: RepoRow): RepoWithStars => ({
  id: r.id,
  githubId: r.github_id,
  isAvailable: r.is_available === 1,
  fullName: r.full_name,
  owner: r.owner,
  name: r.name,
  description: r.description,
  language: r.language,
  stargazers: r.stargazers,
  htmlUrl: r.html_url,
  submitterId: r.submitter_id,
  ownerUserId: r.owner_user_id ?? null,
  createdAt: r.created_at,
  submitter: { id: r.submitter_id, login: r.s_login, avatarUrl: r.s_avatar, xhsName: r.s_xhs },
  person: r.owner_user_id
    ? { id: r.owner_user_id, login: r.owner_login!, avatarUrl: r.owner_avatar, xhsName: r.owner_xhs }
    : { id: r.submitter_id, login: r.s_login, avatarUrl: r.s_avatar, xhsName: r.s_xhs },
  stars: [],
});

/* ---------- users ---------- */

export function upsertUser(input: {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  approved: boolean;
  isAdmin: boolean;
}): void {
  db.prepare(
    `INSERT INTO users (id, login, name, avatar_url, approved, is_admin)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       login = excluded.login,
       name = excluded.name,
       avatar_url = excluded.avatar_url,
       approved = MAX(users.approved, excluded.approved),
       is_admin = excluded.is_admin,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(input.id, input.login, input.name, input.avatarUrl, input.approved ? 1 : 0, input.isAdmin ? 1 : 0);
}

export function getUserById(id: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function approveUser(id: string): void {
  db.prepare(`UPDATE users SET approved = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);
}

export function setXhsName(id: string, xhsName: string | null): void {
  db.prepare(`UPDATE users SET xhs_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(xhsName, id);
}

export function listUsersForStarSync(): { id: string; login: string }[] {
  return db.prepare(`SELECT id, login FROM users ORDER BY id`).all() as { id: string; login: string }[];
}

/** repo_id -> submitter_id，同步对账时用来排除「自己 Star 自己录入的仓库」 */
export function mapRepoSubmitters(): Map<number, string> {
  const rows = db.prepare(`SELECT id, submitter_id FROM repos`).all() as { id: number; submitter_id: string }[];
  return new Map(rows.map((row) => [row.id, row.submitter_id]));
}

/**
 * 仓库可能在 owner 第一次登录前由管理员预录，或由其他成员代录。
 * owner 登录后只切换仓库归属；stars 仍引用原 repo_id，因此历史记录会完整保留。
 */
export function claimReposByOwner(userId: string, login: string): number {
  db.exec("BEGIN IMMEDIATE");
  try {
    const source = db
      .prepare(
        `SELECT u.xhs_name
         FROM repos r JOIN users u ON u.id = r.submitter_id
         WHERE lower(r.owner) = lower(?)
           AND r.submitter_id <> ?
           AND u.xhs_name IS NOT NULL
           AND trim(u.xhs_name) <> ''
         ORDER BY r.created_at ASC
         LIMIT 1`,
      )
      .get(login, userId) as { xhs_name: string } | undefined;

    if (source) {
      db.prepare(
        `UPDATE users
         SET xhs_name = COALESCE(NULLIF(trim(xhs_name), ''), ?),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      ).run(source.xhs_name, userId);
    }

    const result = db
      .prepare(
        `UPDATE repos
         SET submitter_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE lower(owner) = lower(?) AND submitter_id <> ?`,
      )
      .run(userId, login, userId);
    db.prepare(
      `DELETE FROM received_star_notifications
       WHERE repo_id IN (SELECT id FROM repos WHERE lower(owner) = lower(?))
         AND recipient_id <> ?`,
    ).run(login, userId);
    db.prepare(
      `INSERT OR IGNORE INTO received_star_notifications (recipient_id, star_user_id, repo_id)
       SELECT r.submitter_id, s.user_id, s.repo_id
       FROM stars s JOIN repos r ON r.id = s.repo_id
       WHERE lower(r.owner) = lower(?) AND r.submitter_id <> s.user_id`,
    ).run(login);
    db.exec("COMMIT");
    return Number(result.changes);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/* ---------- repos ---------- */

const REPO_SELECT = `
  SELECT r.*, u.login AS s_login, u.avatar_url AS s_avatar, u.xhs_name AS s_xhs,
         o.id AS owner_user_id, o.login AS owner_login, o.avatar_url AS owner_avatar, o.xhs_name AS owner_xhs
  FROM repos r
  JOIN users u ON u.id = r.submitter_id
  LEFT JOIN users o ON lower(o.login) = lower(r.owner)`;

function attachStars(repos: RepoWithStars[]): RepoWithStars[] {
  if (repos.length === 0) return repos;
  const ids = repos.map((r) => r.id);
  const rows = db
    .prepare(
      `SELECT s.repo_id, s.created_at, u.id, u.login, u.avatar_url, u.xhs_name
       FROM stars s JOIN users u ON u.id = s.user_id
       WHERE s.repo_id IN (${ids.map(() => "?").join(",")})
       ORDER BY s.created_at DESC`,
    )
    .all(...ids) as {
    repo_id: number;
    created_at: string;
    id: string;
    login: string;
    avatar_url: string | null;
    xhs_name: string | null;
  }[];
  const byRepo = new Map<number, RepoWithStars>(repos.map((r) => [r.id, r]));
  for (const row of rows) {
    byRepo.get(row.repo_id)?.stars.push({
      user: { id: row.id, login: row.login, avatarUrl: row.avatar_url, xhsName: row.xhs_name },
      createdAt: row.created_at,
    });
  }
  return repos;
}

export function listRepos({ includeUnavailable = false } = {}): RepoWithStars[] {
  const rows = db.prepare(`${REPO_SELECT} ${includeUnavailable ? "" : "WHERE r.is_available = 1"} ORDER BY r.created_at DESC`).all() as RepoRow[];
  return attachStars(rows.map(toRepo));
}

export function listReposBySubmitter(submitterId: string): RepoWithStars[] {
  const rows = db.prepare(`${REPO_SELECT} WHERE r.submitter_id = ? ORDER BY r.created_at DESC`).all(submitterId) as RepoRow[];
  return attachStars(rows.map(toRepo));
}

export function getRepoById(id: number): RepoWithStars | null {
  const row = db.prepare(`${REPO_SELECT} WHERE r.id = ?`).get(id) as RepoRow | undefined;
  return row ? attachStars([toRepo(row)])[0] : null;
}

export function getRepoByFullName(fullName: string): Repo | null {
  const row = db.prepare(`${REPO_SELECT} WHERE lower(r.full_name) = lower(?)`).get(fullName) as RepoRow | undefined;
  return row ? toRepo(row) : null;
}

export function getRepoByGitHubId(githubId: string): Repo | null {
  const row = db.prepare(`${REPO_SELECT} WHERE r.github_id = ?`).get(githubId) as RepoRow | undefined;
  return row ? toRepo(row) : null;
}

export function createRepo(input: {
  githubId: string;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  htmlUrl: string;
  submitterId: string;
}): number {
  const res = db
    .prepare(
      `INSERT INTO repos (github_id, full_name, owner, name, description, language, stargazers, html_url, submitter_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.githubId,
      input.fullName,
      input.owner,
      input.name,
      input.description,
      input.language,
      input.stargazers,
      input.htmlUrl,
      input.submitterId,
    );
  return Number(res.lastInsertRowid);
}

export function updateRepoMeta(id: number, meta: GitHubRepo): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    updateRepositoryIdentity(db, id, meta);
    db.prepare(
      `UPDATE repos SET stargazers = ?, description = ?, language = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(meta.stargazers, meta.description, meta.language, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteRepo(id: number): void {
  db.prepare(`DELETE FROM repos WHERE id = ?`).run(id);
}

/* ---------- stars ---------- */

export function upsertStar(userId: string, repoId: number): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO stars (user_id, repo_id, mutation_version) VALUES (?, ?, 1)
       ON CONFLICT(user_id, repo_id) DO UPDATE SET mutation_version = mutation_version + 1`,
    ).run(userId, repoId);
    db.prepare(
      `INSERT OR IGNORE INTO received_star_notifications (recipient_id, star_user_id, repo_id)
       SELECT submitter_id, ?, id FROM repos WHERE id = ? AND submitter_id <> ?`,
    ).run(userId, repoId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type GitHubStarTruth = { userId: string; repoId: number; starredAt: string | null };
type StarSyncRow = { id: number; user_id: string; repo_id: number; mutation_version: number };

export function snapshotGitHubStars(userIds: string[]): StarSyncRow[] {
  if (userIds.length === 0) return [];
  return db.prepare(
    `SELECT id, user_id, repo_id, mutation_version FROM stars WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
  ).all(...userIds) as StarSyncRow[];
}

/**
 * 用一次完整的 GitHub 快照对账。只有全部远端数据拉取成功后才调用，避免用半份结果误删记录。
 */
export function reconcileGitHubStars(
  entries: GitHubStarTruth[],
  syncedUserIds: string[],
  baseline: StarSyncRow[],
  verifiedRepoIds: number[],
): { added: number; removed: number; total: number } {
  if (syncedUserIds.length === 0) return { added: 0, removed: 0, total: 0 };

  const actual = new Map(entries.map((entry) => [`${entry.userId}:${entry.repoId}`, entry]));
  const placeholders = syncedUserIds.map(() => "?").join(",");
  const versions = new Map(baseline.map((row) => [row.id, row.mutation_version]));
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

  let added = 0;
  let removed = 0;
  let total = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    const available = new Set((db.prepare('SELECT id FROM repos WHERE is_available = 1').all() as { id: number }[]).map((repo) => repo.id));
    const verified = new Set(verifiedRepoIds.filter((id) => available.has(id)));
    const current = snapshotGitHubStars(syncedUserIds);
    const currentKeys = new Set(current.map((entry) => `${entry.user_id}:${entry.repo_id}`));
    // A successful Star after the read began is newer than this GitHub snapshot.
    const changed = new Set(current.filter((row) => versions.get(row.id) !== row.mutation_version)
      .map((row) => `${row.user_id}:${row.repo_id}`));
    for (const row of current) {
      if (!verified.has(row.repo_id)) continue;
      if (changed.has(`${row.user_id}:${row.repo_id}`)) continue;
      if (actual.has(`${row.user_id}:${row.repo_id}`)) continue;
      removeNotification.run(row.user_id, row.repo_id);
      remove.run(row.user_id, row.repo_id);
      removed++;
    }
    for (const entry of actual.values()) {
      if (!verified.has(entry.repoId)) continue;
      const key = `${entry.userId}:${entry.repoId}`;
      if (!currentKeys.has(key)) added++;
      if (changed.has(key)) continue;
      if (entry.starredAt) insertWithTime.run(entry.userId, entry.repoId, entry.starredAt);
      else insert.run(entry.userId, entry.repoId);
      insertNotification.run(entry.userId, entry.repoId, entry.userId);
    }
    total = (db.prepare(`SELECT COUNT(*) AS count FROM stars WHERE user_id IN (${placeholders})`)
      .get(...syncedUserIds) as { count: number }).count;
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { added, removed, total };
}

const FULL_STAR_SYNC_KEY = "github-stars:all-users";

export function isGitHubStarSyncFresh(maxAgeMs: number): boolean {
  const row = db.prepare(`SELECT synced_at FROM sync_state WHERE key = ?`).get(FULL_STAR_SYNC_KEY) as
    | { synced_at: string }
    | undefined;
  if (!row) return false;
  const syncedAt = Date.parse(row.synced_at);
  return Number.isFinite(syncedAt) && Date.now() - syncedAt < maxAgeMs;
}

export function markGitHubStarsSynced(): void {
  db.prepare(
    `INSERT INTO sync_state (key, synced_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET synced_at = excluded.synced_at`,
  ).run(FULL_STAR_SYNC_KEY);
}

/* ---------- 记录 ---------- */

export type StarRecord = {
  id: number;
  createdAt: string;
  repo: { id: number; fullName: string; owner: string; name: string; htmlUrl: string; language: string | null; isAvailable: boolean };
  /** 点 Star 的人 */
  user: UserBrief;
  /** 仓库录入者 */
  submitter: UserBrief;
  /** 仓库所属用户 */
  person: UserBrief;
  /** 该仓库在本站属于谁（见 repoPersonId），互 Star 判定以此为准 */
  personId: string;
};

type StarRecordRow = {
  id: number;
  created_at: string;
  repo_id: number;
  is_available: number;
  full_name: string;
  owner: string;
  name: string;
  html_url: string;
  language: string | null;
  u_id: string;
  u_login: string;
  u_avatar: string | null;
  u_xhs: string | null;
  s_id: string;
  s_login: string;
  s_avatar: string | null;
  s_xhs: string | null;
  owner_user_id: string | null;
  owner_login: string | null;
  owner_avatar: string | null;
  owner_xhs: string | null;
};

const STAR_RECORD_SELECT = `
  SELECT s.id, s.created_at, r.id AS repo_id, r.is_available, r.full_name, r.owner, r.name, r.html_url, r.language,
         u.id AS u_id, u.login AS u_login, u.avatar_url AS u_avatar, u.xhs_name AS u_xhs,
         o.id AS s_id, o.login AS s_login, o.avatar_url AS s_avatar, o.xhs_name AS s_xhs,
         ow.id AS owner_user_id, ow.login AS owner_login, ow.avatar_url AS owner_avatar, ow.xhs_name AS owner_xhs
  FROM stars s
  JOIN repos r ON r.id = s.repo_id
  JOIN users u ON u.id = s.user_id
  JOIN users o ON o.id = r.submitter_id
  LEFT JOIN users ow ON lower(ow.login) = lower(r.owner)`;

const toStarRecord = (r: StarRecordRow): StarRecord => ({
  id: r.id,
  createdAt: r.created_at,
  repo: { id: r.repo_id, fullName: r.full_name, owner: r.owner, name: r.name, htmlUrl: r.html_url, language: r.language, isAvailable: r.is_available === 1 },
  user: { id: r.u_id, login: r.u_login, avatarUrl: r.u_avatar, xhsName: r.u_xhs },
  submitter: { id: r.s_id, login: r.s_login, avatarUrl: r.s_avatar, xhsName: r.s_xhs },
  person: r.owner_user_id
    ? { id: r.owner_user_id, login: r.owner_login!, avatarUrl: r.owner_avatar, xhsName: r.owner_xhs }
    : { id: r.s_id, login: r.s_login, avatarUrl: r.s_avatar, xhsName: r.s_xhs },
  personId: r.owner_user_id ?? r.s_id,
});

/** 我 Star 过的（不含 Star 自己仓库的记录） */
export function listStarsGiven(userId: string): StarRecord[] {
  const rows = db
    .prepare(`${STAR_RECORD_SELECT} WHERE s.user_id = ? AND COALESCE(ow.id, o.id) <> ? ORDER BY s.created_at DESC`)
    .all(userId, userId) as StarRecordRow[];
  return rows.map(toStarRecord);
}

/** 我的仓库（owner 是我，或我录入的组织仓库）收到的，不含自己 Star 自己 */
export function listStarsReceived(userId: string): StarRecord[] {
  const rows = db
    .prepare(`${STAR_RECORD_SELECT} WHERE COALESCE(ow.id, o.id) = ? AND s.user_id <> ? ORDER BY s.created_at DESC`)
    .all(userId, userId) as StarRecordRow[];
  return rows.map(toStarRecord);
}

export type ReceivedStarNotification = {
  id: number;
  discoveredAt: string;
  createdAt: string;
  repo: StarRecord["repo"];
  user: UserBrief;
  /** 对方（给你点 Star 的人）在本站录入的仓库，方便回点形成互 Star */
  starrerRepos: { fullName: string; htmlUrl: string }[];
};

type ReceivedStarNotificationRow = StarRecordRow & {
  notification_id: number;
  discovered_at: string;
};

export function listUnreadReceivedStars(
  userId: string,
  limit = 5,
): { total: number; ids: number[]; items: ReceivedStarNotification[] } {
  const total = (
    db.prepare(
      `SELECT COUNT(*) AS count
       FROM received_star_notifications n
       JOIN stars s ON s.user_id = n.star_user_id AND s.repo_id = n.repo_id
       WHERE n.recipient_id = ? AND n.seen_at IS NULL`,
    ).get(userId) as { count: number }
  ).count;
  const ids = db
    .prepare(
      `SELECT n.id
       FROM received_star_notifications n
       JOIN stars s ON s.user_id = n.star_user_id AND s.repo_id = n.repo_id
       WHERE n.recipient_id = ? AND n.seen_at IS NULL
       ORDER BY n.discovered_at DESC, n.id DESC
       LIMIT 100`,
    )
    .all(userId) as { id: number }[];
  const rows = db
    .prepare(
      `SELECT n.id AS notification_id, n.discovered_at,
              s.id, s.created_at, r.id AS repo_id, r.is_available, r.full_name, r.owner, r.name, r.html_url, r.language,
              u.id AS u_id, u.login AS u_login, u.avatar_url AS u_avatar, u.xhs_name AS u_xhs,
              o.id AS s_id, o.login AS s_login, o.avatar_url AS s_avatar, o.xhs_name AS s_xhs,
              ow.id AS owner_user_id, ow.login AS owner_login, ow.avatar_url AS owner_avatar, ow.xhs_name AS owner_xhs
       FROM received_star_notifications n
       JOIN stars s ON s.user_id = n.star_user_id AND s.repo_id = n.repo_id
       JOIN repos r ON r.id = n.repo_id
       JOIN users u ON u.id = n.star_user_id
       JOIN users o ON o.id = r.submitter_id
       LEFT JOIN users ow ON lower(ow.login) = lower(r.owner)
       WHERE n.recipient_id = ? AND n.seen_at IS NULL
       ORDER BY n.discovered_at DESC, n.id DESC
       LIMIT ?`,
    )
    .all(userId, Math.max(1, Math.min(limit, 20))) as ReceivedStarNotificationRow[];

  // 一次性查出这批「对方」在本站录入的可用仓库，按对方用户分组，避免 N+1 查询
  const starrerIds = [...new Set(rows.map((row) => row.u_id))];
  const reposByStarrer = new Map<string, { fullName: string; htmlUrl: string }[]>();
  if (starrerIds.length > 0) {
    const repoRows = db
      .prepare(
        `SELECT submitter_id, full_name, html_url
         FROM repos
         WHERE is_available = 1 AND submitter_id IN (${starrerIds.map(() => "?").join(",")})
         ORDER BY created_at ASC`,
      )
      .all(...starrerIds) as { submitter_id: string; full_name: string; html_url: string }[];
    for (const repo of repoRows) {
      const list = reposByStarrer.get(repo.submitter_id) ?? [];
      list.push({ fullName: repo.full_name, htmlUrl: repo.html_url });
      reposByStarrer.set(repo.submitter_id, list);
    }
  }

  return {
    total,
    ids: ids.map((row) => row.id),
    items: rows.map((row) => {
      const record = toStarRecord(row);
      return {
        id: row.notification_id,
        discoveredAt: row.discovered_at,
        createdAt: record.createdAt,
        repo: record.repo,
        user: record.user,
        starrerRepos: reposByStarrer.get(row.u_id) ?? [],
      };
    }),
  };
}

export function markReceivedStarsSeen(userId: string, notificationIds: number[]): number {
  const ids = [...new Set(notificationIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE received_star_notifications
       SET seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE recipient_id = ? AND seen_at IS NULL AND id IN (${placeholders})`,
    )
    .run(userId, ...ids);
  return Number(result.changes);
}

/* ---------- stats ---------- */

export function getStats(): { members: number; repos: number; stars: number } {
  const members = (db.prepare(`SELECT COUNT(*) AS c FROM users WHERE approved = 1`).get() as { c: number }).c;
  const repos = (db.prepare(`SELECT COUNT(*) AS c FROM repos WHERE is_available = 1`).get() as { c: number }).c;
  const stars = (db.prepare(`SELECT COUNT(*) AS c FROM stars`).get() as { c: number }).c;
  return { members, repos, stars };
}
