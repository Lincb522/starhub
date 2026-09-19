import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { syncGitHubStarRecords } from "./github-star-sync.mjs";
import { publicRepositoryFixture } from './github-repo-fixture.mjs';

test("reconciles added and removed stars from a complete GitHub snapshot", async () => {
  const directory = mkdtempSync(join(tmpdir(), "starhub-star-sync-"));
  const databasePath = join(directory, "starhub.db");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE);
    CREATE TABLE repos (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL UNIQUE,
      owner TEXT,
      name TEXT,
      html_url TEXT,
      submitter_id TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE stars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      repo_id INTEGER NOT NULL REFERENCES repos(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, repo_id)
    );
    CREATE TABLE received_star_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id TEXT NOT NULL REFERENCES users(id),
      star_user_id TEXT NOT NULL REFERENCES users(id),
      repo_id INTEGER NOT NULL REFERENCES repos(id),
      discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      seen_at TEXT,
      UNIQUE(recipient_id, star_user_id, repo_id)
    );
    INSERT INTO users (id, login) VALUES ('u1', 'alice'), ('u2', 'bob');
    INSERT INTO repos (id, full_name, submitter_id) VALUES
      (1, 'owner/one', 'u2'),
      (2, 'owner/two', 'u2');
    INSERT INTO stars (user_id, repo_id) VALUES ('u1', 2);
    INSERT INTO received_star_notifications (recipient_id, star_user_id, repo_id)
      VALUES ('u2', 'u1', 2);
  `);
  db.close();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (/^\/(repos|repositories)\//.test(new URL(String(url)).pathname)) return Response.json(publicRepositoryFixture(url, 'owner'));
    const login = new URL(String(url)).pathname.split("/")[2];
    const rows = login === "alice"
      ? [{ starred_at: "2026-08-01T02:03:04Z", repo: { id: 1001, full_name: "owner/one" } }]
      : [];
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await syncGitHubStarRecords({ databasePath });
    assert.deepEqual(result, { dryRun: false, users: 2, repos: 2, added: 1, removed: 1, total: 1,
      availability: { checked: 2, unavailable: [], restored: [], errors: [] } });

    const verified = new DatabaseSync(databasePath);
    const rows = verified
      .prepare(`SELECT user_id, repo_id, created_at FROM stars`)
      .all()
      .map((row) => ({ user_id: row.user_id, repo_id: row.repo_id, created_at: row.created_at }));
    const notifications = verified
      .prepare(`SELECT recipient_id, star_user_id, repo_id, seen_at FROM received_star_notifications`)
      .all()
      .map((row) => ({
        recipient_id: row.recipient_id,
        star_user_id: row.star_user_id,
        repo_id: row.repo_id,
        seen_at: row.seen_at,
      }));
    verified.close();
    assert.deepEqual(rows, [{ user_id: "u1", repo_id: 1, created_at: "2026-08-01T02:03:04Z" }]);
    assert.deepEqual(notifications, [{ recipient_id: "u2", star_user_id: "u1", repo_id: 1, seen_at: null }]);

    const acknowledged = new DatabaseSync(databasePath);
    acknowledged.prepare(`UPDATE received_star_notifications SET seen_at = '2026-09-04T10:00:00Z'`).run();
    acknowledged.close();
    const secondResult = await syncGitHubStarRecords({ databasePath });
    assert.deepEqual(secondResult, { dryRun: false, users: 2, repos: 2, added: 0, removed: 0, total: 1,
      availability: { checked: 2, unavailable: [], restored: [], errors: [] } });

    const resynced = new DatabaseSync(databasePath);
    const persisted = resynced.prepare(`SELECT seen_at FROM received_star_notifications`).get();
    resynced.close();
    assert.equal(persisted.seen_at, "2026-09-04T10:00:00Z");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
