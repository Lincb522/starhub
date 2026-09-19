import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { ensureRepositoryAvailabilitySchema, readRepositoryIdentity, updateRepositoryIdentity } from './repo-availability.mjs';

const GITHUB_API = "https://api.github.com";

export function parseGitHubRepository(value) {
  const text = String(value ?? "").trim();
  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  const shortMatch = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  const match = urlMatch ?? shortMatch;
  if (!match) throw new Error("未找到有效的 GitHub 仓库地址");

  const name = match[2].replace(/\.git$/i, "");
  if (!name) throw new Error("GitHub 仓库名为空");
  return { owner: match[1], name };
}

async function fetchGitHubRepository(owner, name) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "star-hub-feishu-sync",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let response;
  try {
    response = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`${owner}/${name} 获取失败：${error instanceof Error ? error.message : "网络错误"}`);
  }

  if (response.status === 404) return { unavailable: true, reason: "GitHub 仓库不存在或未公开" };
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reason = remaining === "0" ? "GitHub API 额度已用完" : `GitHub API ${response.status}`;
    throw new Error(`${owner}/${name} 获取失败：${reason}`);
  }

  const repo = await response.json();
  if (repo.private !== false) return { unavailable: true, reason: "GitHub 仓库未公开" };
  return {
    unavailable: false,
    ...readRepositoryIdentity(repo),
    ownerAvatar: repo.owner.avatar_url ?? null,
    ownerType: repo.owner.type,
    description: repo.description ?? null,
    language: repo.language ?? null,
    stargazers: repo.stargazers_count ?? 0,
  };
}

export async function syncRepositoryRows({ databasePath, sourceRows, dryRun = false, strictInput = false }) {
  if (!databasePath) throw new Error("缺少数据库路径，请传 --db=/path/to/starhub.db 或设置 DATABASE_PATH");
  if (!existsSync(databasePath)) throw new Error(`数据库不存在：${databasePath}`);

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (!dryRun) ensureRepositoryAvailabilitySchema(db);

  const findRepo = db.prepare(`SELECT id, submitter_id, full_name FROM repos WHERE lower(full_name) = lower(?)`);
  const hasIdentity = db.prepare('PRAGMA table_info(repos)').all().some((column) => column.name === 'github_id');
  const findIdentity = hasIdentity ? db.prepare('SELECT id, submitter_id, full_name FROM repos WHERE github_id = ?') : null;
  const findFetchedRepo = (row) => findIdentity?.get(row.githubId) ?? findRepo.get(row.fullName);
  const findUserByLogin = db.prepare(`SELECT id FROM users WHERE lower(login) = lower(?)`);
  const insertUser = db.prepare(
    `INSERT INTO users (id, login, name, avatar_url, xhs_name, approved, is_admin)
     VALUES (?, ?, NULL, ?, ?, 0, 0)
     ON CONFLICT(id) DO UPDATE SET
       login = excluded.login,
       avatar_url = COALESCE(users.avatar_url, excluded.avatar_url),
       xhs_name = COALESCE(NULLIF(trim(users.xhs_name), ''), excluded.xhs_name),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  );
  const insertRepo = dryRun ? null : db.prepare(
    `INSERT INTO repos (github_id, full_name, owner, name, description, language, stargazers, html_url, submitter_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const refreshRepo = db.prepare(
    `UPDATE repos
     SET full_name = ?, owner = ?, name = ?, description = ?, language = ?, stargazers = ?, html_url = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const fillXhs = db.prepare(
    `UPDATE users
     SET xhs_name = COALESCE(NULLIF(trim(xhs_name), ''), ?),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );

  try {
    const uniqueInputs = [];
    const seenInputs = new Set();
    const skippedRows = [];
    for (const row of sourceRows) {
      let parsed;
      try {
        parsed = parseGitHubRepository(row.repo);
      } catch (error) {
        if (strictInput) throw new Error(`第 ${row.sourceRow ?? "?"} 行：${error.message}`);
        skippedRows.push({ sourceRow: row.sourceRow ?? null, reason: error.message });
        continue;
      }

      const key = `${parsed.owner}/${parsed.name}`.toLowerCase();
      if (seenInputs.has(key)) {
        skippedRows.push({ sourceRow: row.sourceRow ?? null, reason: "飞书表格内重复" });
        continue;
      }
      seenInputs.add(key);
      uniqueInputs.push({ ...row, ...parsed });
    }

    const existingRows = [];
    const pendingInputs = [];
    for (const row of uniqueInputs) {
      const savedRepo = findRepo.get(`${row.owner}/${row.name}`);
      if (savedRepo) existingRows.push({ ...row, savedRepo });
      else pendingInputs.push(row);
    }

    const fetchedRows = [];
    const seenCanonical = new Set(existingRows.map(({ savedRepo }) => savedRepo.full_name.toLowerCase()));
    for (const row of pendingInputs) {
      const repo = await fetchGitHubRepository(row.owner, row.name);
      if (repo.unavailable) {
        skippedRows.push({ sourceRow: row.sourceRow ?? null, reason: repo.reason });
        continue;
      }

      const key = repo.fullName.toLowerCase();
      if (seenCanonical.has(key)) {
        skippedRows.push({ sourceRow: row.sourceRow ?? null, reason: "解析后与其他仓库重复" });
        continue;
      }
      seenCanonical.add(key);
      fetchedRows.push({ ...row, ...repo });
    }

    const toInsert = fetchedRows.filter((row) => !findFetchedRepo(row));
    const resolvedExisting = fetchedRows.filter((row) => findFetchedRepo(row));

    if (!dryRun) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const { xhsName, savedRepo } of existingRows) {
          if (xhsName) fillXhs.run(xhsName, savedRepo.submitter_id);
        }

        for (const row of fetchedRows) {
          const savedRepo = findFetchedRepo(row);
          if (savedRepo) {
            updateRepositoryIdentity(db, savedRepo.id, row);
            refreshRepo.run(
              row.fullName,
              row.owner,
              row.name,
              row.description,
              row.language,
              row.stargazers,
              row.htmlUrl,
              savedRepo.id,
            );
            if (row.xhsName) fillXhs.run(row.xhsName, savedRepo.submitter_id);
            continue;
          }

          const sameLogin = findUserByLogin.get(row.owner);
          if (sameLogin && sameLogin.id !== row.ownerId) {
            throw new Error(`用户冲突：${row.owner} 已绑定到其他 GitHub ID`);
          }
          insertUser.run(row.ownerId, row.owner, row.ownerAvatar, row.xhsName);
          insertRepo.run(
            row.githubId,
            row.fullName,
            row.owner,
            row.name,
            row.description,
            row.language,
            row.stargazers,
            row.htmlUrl,
            row.ownerId,
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }

    return {
      dryRun,
      sourceRows: sourceRows.length,
      uniqueInputs: uniqueInputs.length,
      existing: [...existingRows.map(({ savedRepo }) => savedRepo.full_name), ...resolvedExisting.map((row) => row.fullName)],
      inserted: toInsert.map((row) => row.fullName),
      skippedRows,
      ownerTypes: {
        users: fetchedRows.filter((row) => row.ownerType === "User").length,
        organizations: fetchedRows.filter((row) => row.ownerType === "Organization").length,
      },
    };
  } finally {
    db.close();
  }
}
