import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import test, { after } from 'node:test';
import { syncGitHubStarRecords } from './github-star-sync.mjs';
import { syncRepositoryAvailability } from './repo-availability.mjs';
import { syncRepositoryRows } from './repo-sync.mjs';

const directory = mkdtempSync(join(tmpdir(), 'starhub-identity-'));
process.env.DATABASE_PATH = join(directory, 'starhub.db');
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('@/')
    ? new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const database = await import('../../src/lib/db.ts');
const { syncGitHubStarTruth } = await import('../../src/lib/github-star-sync.ts');
const { db } = database;
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

function seed() {
  db.exec(`DELETE FROM sync_state; DELETE FROM users;
    INSERT INTO users (id, login) VALUES ('1', 'alice'), ('2', 'old-owner');
    INSERT INTO repos (id, full_name, owner, name, html_url, submitter_id)
      VALUES (15, 'old-owner/old-name', 'old-owner', 'old-name', 'https://github.com/old-owner/old-name', '2');`);
  delete globalThis.__starhubGitHubStarSyncFailure;
  database.upsertStar('1', 15);
  db.exec("UPDATE received_star_notifications SET seen_at = '2026-09-01T00:00:00Z'");
}
const canonical = { id: 1345796618, private: false, full_name: 'new-owner/new-name', name: 'new-name',
  html_url: 'https://github.com/new-owner/new-name', owner: { id: 2, login: 'new-owner', type: 'User' } };

for (const path of ['page', 'scheduled']) {
  test(`${path}: an unavailable user is not evidence that all their Stars were removed`, async (t) => {
    seed();
    t.mock.method(globalThis, 'fetch', async (url) => /^\/(repos|repositories)\//.test(new URL(String(url)).pathname)
      ? Response.json(canonical) : new Response('', { status: 404 }));
    if (path === 'page') assert.equal((await syncGitHubStarTruth({ id: '1', login: 'alice' }, { blocking: true })).ok, false);
    else await assert.rejects(syncGitHubStarRecords({ databasePath: process.env.DATABASE_PATH }));
    assert.equal(database.listStarsGiven('1').length, 1);
  });
  test(`${path}: rename preserves Stars across repeated syncs and updates the same owner's login`, async (t) => {
    seed();
    const paths = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      const pathname = new URL(String(url)).pathname;
      paths.push(pathname);
      if (/^\/(repos|repositories)\//.test(pathname)) return Response.json(canonical);
      if (pathname === '/users/old-owner/starred') throw new Error('Must resolve owner rename before reading Stars');
      return Response.json(pathname === '/users/alice/starred'
        ? [{ starred_at: '2026-09-03T13:13:47Z', repo: { id: canonical.id, full_name: canonical.full_name } }] : []);
    });
    for (let iteration = 0; iteration < 2; iteration++) {
      db.exec('DELETE FROM sync_state');
      const result = path === 'page' ? await syncGitHubStarTruth({ id: '1', login: 'alice' }, { blocking: true })
        : await syncGitHubStarRecords({ databasePath: process.env.DATABASE_PATH });
      assert.notEqual(result.ok, false);
      assert.equal(result.removed, 0);
      assert.equal(database.getRepoById(15).fullName, canonical.full_name);
      assert.equal(database.getRepoById(15).submitterId, '2');
      assert.equal(database.listStarsGiven('1')[0]?.createdAt, '2026-09-03T13:13:47Z');
      assert.equal(db.prepare('SELECT seen_at FROM received_star_notifications').get().seen_at, '2026-09-01T00:00:00Z');
    }
    assert.ok(paths.includes(`/repositories/${canonical.id}`));
    assert.equal(db.prepare("SELECT login FROM users WHERE id = '2'").get().login, 'new-owner');
    const imported = await syncRepositoryRows({ databasePath: process.env.DATABASE_PATH,
      sourceRows: [{ repo: 'old-owner/old-name', xhsName: null }, { repo: 'new-owner/new-name', xhsName: null }] });
    assert.deepEqual(imported.inserted, []);
    assert.equal(database.listRepos().length, 1);
    assert.equal(database.listStarsGiven('1').length, 1);
  });
}

test('bound repository identity cannot switch when an old name is reused', async (t) => {
  seed();
  t.mock.method(globalThis, 'fetch', async () => Response.json(canonical));
  await syncRepositoryAvailability(db);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...canonical, id: 999 }));
  const result = await syncRepositoryAvailability(db);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.verifiedRepoIds, []);
  assert.equal(database.getRepoById(15).githubId, String(canonical.id));
  assert.equal(database.listStarsGiven('1').length, 1);
});

test('import deduplicates by GitHub ID before the saved address has been refreshed', async (t) => {
  seed();
  db.prepare('UPDATE repos SET github_id = ? WHERE id = 15').run(String(canonical.id));
  t.mock.method(globalThis, 'fetch', async () => Response.json(canonical));
  const result = await syncRepositoryRows({ databasePath: process.env.DATABASE_PATH,
    sourceRows: [{ repo: canonical.full_name, xhsName: null }] });
  assert.deepEqual(result.inserted, []);
  assert.equal(database.listRepos().length, 1);
  assert.equal(database.getRepoById(15).fullName, canonical.full_name);
  assert.equal(database.listStarsGiven('1').length, 1);
});

test('conflicting canonical records are preserved and excluded from destructive reconciliation', async (t) => {
  seed();
  db.exec(`INSERT INTO repos (full_name, owner, name, html_url, submitter_id)
    VALUES ('new-owner/new-name', 'new-owner', 'new-name', 'https://github.com/new-owner/new-name', '2')`);
  t.mock.method(globalThis, 'fetch', async () => Response.json(canonical));
  const result = await syncRepositoryAvailability(db, { repoIds: [15] });
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.verifiedRepoIds, []);
  assert.equal(database.getRepoById(15).fullName, 'old-owner/old-name');
  assert.equal(database.listStarsGiven('1').length, 1);
});

test('a transfer never reassigns the submitter or renames a different user', async (t) => {
  seed();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...canonical, owner: { id: 3, login: 'new-owner' } }));
  await syncRepositoryAvailability(db);
  assert.equal(database.getRepoById(15).submitterId, '2');
  assert.equal(db.prepare("SELECT login FROM users WHERE id = '2'").get().login, 'old-owner');
});
