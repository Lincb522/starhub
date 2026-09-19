#!/usr/bin/env node
import { fetchPublicFeishuRepositoryRows } from "./lib/feishu-sheet.mjs";
import { syncRepositoryRows } from "./lib/repo-sync.mjs";
import { syncGitHubStarRecords } from "./lib/github-star-sync.mjs";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { syncRepositoryAvailability } from "./lib/repo-availability.mjs";

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const databasePath = option("db") || process.env.DATABASE_PATH;
const sourceUrl = option("source-url") || process.env.FEISHU_REPO_SHEET_URL;
const dryRun = process.argv.includes("--dry-run");
let availability = null;

try {
  if (!sourceUrl) throw new Error("缺少飞书表格地址：请设置 FEISHU_REPO_SHEET_URL 或传入 --source-url=");
  if (!databasePath || !existsSync(databasePath)) throw new Error("仓库状态同步失败：数据库路径不存在");
  const db = new DatabaseSync(databasePath, { readOnly: dryRun });
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    const result = await syncRepositoryAvailability(db, { token: process.env.GITHUB_TOKEN, dryRun });
    availability = { checked: result.checked, unavailable: result.unavailable, restored: result.restored, errors: result.errors,
      purged: result.purged, ...(result.purgeSkipped ? { purgeSkipped: result.purgeSkipped } : {}) };
  } finally {
    db.close();
  }
  const sheet = await fetchPublicFeishuRepositoryRows(sourceUrl);
  const result = await syncRepositoryRows({ databasePath, sourceRows: sheet.rows, dryRun });
  let starSync = null;
  if (!dryRun && result.inserted.length > 0) {
    try {
      starSync = await syncGitHubStarRecords({ databasePath, repoFullNames: result.inserted });
    } catch (error) {
      starSync = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    feishuRevision: sheet.revision,
    sheetId: sheet.sheetId,
    feishuWarnings: sheet.warnings,
    ...result,
    starSync,
    availability,
  }));
  if (availability.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    availability,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
}
