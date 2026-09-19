#!/usr/bin/env node
// 批量导入仓库：node scripts/import-repos.mjs --input=members.json --db=./data/starhub.db
// 输入为 JSON 数组，每项 { "xhsName": "小红书名", "repo": "https://github.com/owner/repo" }
// （默认读取 scripts/import-repos-*.json，这类含成员信息的文件已被 .gitignore 排除）
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureRepositoryAvailabilitySchema, readRepositoryIdentity, updateRepositoryIdentity } from './lib/repo-availability.mjs';

const API = "https://api.github.com";
const defaultInput = fileURLToPath(new URL("./import-repos-2026-09-04.json", import.meta.url));

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const inputPath = option("input") || defaultInput;
const databasePath = option("db") || process.env.DATABASE_PATH;
const dryRun = process.argv.includes("--dry-run");

if (!databasePath) throw new Error("缺少数据库路径，请传 --db=/path/to/starhub.db 或设置 DATABASE_PATH");
if (!existsSync(databasePath)) throw new Error(`数据库不存在：${databasePath}`);
if (!existsSync(inputPath)) throw new Error(`导入清单不存在：${inputPath}`);

function parseRepo(value) {
  const match = String(value)
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  if (!match) throw new Error(`无效 GitHub 仓库地址：${value}`);
  return { owner: match[1], name: match[2] };
}

async function fetchRepo(owner, name) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "star-hub-import",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(`${API}/repos/${owner}/${name}`, { headers });
  if (!response.ok) throw new Error(`${owner}/${name} 获取失败：GitHub API ${response.status}`);
  const repo = await response.json();
  if (repo.private !== false) throw new Error(`${owner}/${name} 未公开，不能录入`);
  return {
    ...readRepositoryIdentity(repo),
    ownerAvatar: repo.owner.avatar_url ?? null,
    ownerType: repo.owner.type,
    description: repo.description ?? null,
    language: repo.language ?? null,
    stargazers: repo.stargazers_count ?? 0,
  };
}

const sourceRows = JSON.parse(readFileSync(inputPath, "utf8"));
const uniqueInputs = [];
const seenInputs = new Set();
for (const row of sourceRows) {
  const parsed = parseRepo(row.repo);
  const key = `${parsed.owner}/${parsed.name}`.toLowerCase();
  if (seenInputs.has(key)) continue;
  seenInputs.add(key);
  uniqueInputs.push({ ...row, ...parsed });
}

const fetched = [];
const seenCanonical = new Set();
for (const row of uniqueInputs) {
  const repo = await fetchRepo(row.owner, row.name);
  const key = repo.fullName.toLowerCase();
  if (seenCanonical.has(key)) continue;
  seenCanonical.add(key);
  fetched.push({ ...row, ...repo });
}

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON;");
if (!dryRun) ensureRepositoryAvailabilitySchema(db);

const findRepo = db.prepare(`SELECT id, submitter_id FROM repos WHERE lower(full_name) = lower(?)`);
const hasIdentity = db.prepare('PRAGMA table_info(repos)').all().some((column) => column.name === 'github_id');
const findIdentity = hasIdentity ? db.prepare('SELECT id, submitter_id FROM repos WHERE github_id = ?') : null;
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

const existing = fetched.filter((row) => findFetchedRepo(row));
const pending = fetched.filter((row) => !findFetchedRepo(row));

if (!dryRun) {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of fetched) {
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
        fillXhs.run(row.xhsName, savedRepo.submitter_id);
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

console.log(
  JSON.stringify(
    {
      dryRun,
      sourceRows: sourceRows.length,
      uniqueRepos: fetched.length,
      existing: existing.map((row) => row.fullName),
      toInsert: pending.map((row) => row.fullName),
      ownerTypes: {
        users: fetched.filter((row) => row.ownerType === "User").length,
        organizations: fetched.filter((row) => row.ownerType === "Organization").length,
      },
    },
    null,
    2,
  ),
);
