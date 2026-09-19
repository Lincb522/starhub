import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import test, { after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { syncRepositoryAvailability } from './repo-availability.mjs';
import { syncGitHubStarRecords } from './github-star-sync.mjs';
import { syncRepositoryRows } from './repo-sync.mjs';
import { publicRepositoryFixture } from './github-repo-fixture.mjs';

const directory = mkdtempSync(join(tmpdir(), 'starhub-availability-'));
process.env.DATABASE_PATH = join(directory, 'starhub.db');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return nextResolve(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const database = await import('../../src/lib/db.ts');
const { fetchRepo } = await import('../../src/lib/github.ts');
const { syncGitHubStarTruth } = await import('../../src/lib/github-star-sync.ts');
const { db } = database;
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

function seed() {
  db.exec(`DELETE FROM sync_state; DELETE FROM users;
    INSERT INTO users (id, login) VALUES ('viewer', 'alice'), ('owner', 'bob');
    INSERT INTO repos (id, full_name, owner, name, html_url, submitter_id)
      VALUES (1, 'bob/one', 'bob', 'one', 'https://github.com/bob/one', 'owner'),
             (2, 'bob/two', 'bob', 'two', 'https://github.com/bob/two', 'owner');`);
  delete globalThis.__starhubGitHubStarSyncFailure;
  database.upsertStar('viewer', 1);
  database.upsertStar('viewer', 2);
}

for (const path of ['page', 'scheduled']) {
  for (const response of ['404', 'private', '403', '429', '500', 'timeout', 'malformed']) {
    test(`${path}: ${response} cannot erase a Star or its notification`, async (t) => {
      seed();
      const before = database.listStarsGiven('viewer').find((record) => record.repo.id === 1);
      t.mock.method(globalThis, 'fetch', async (url) => {
        const pathname = new URL(String(url)).pathname;
        if (!pathname.startsWith('/repos/')) return Response.json([]);
        if (pathname.endsWith('/two')) return Response.json(publicRepositoryFixture(url));
        if (response === 'private') return Response.json({ private: true });
        if (response === 'timeout') throw new TypeError('fetch failed');
        if (response === 'malformed') return Response.json({});
        return new Response('', { status: Number(response) });
      });
      const result = path === 'page'
        ? await syncGitHubStarTruth({ id: 'viewer', login: 'alice' }, { blocking: true })
        : await syncGitHubStarRecords({ databasePath: process.env.DATABASE_PATH });
      const hidden = response === '404' || response === 'private';
      assert.equal(database.getRepoById(1).isAvailable, !hidden);
      assert.deepEqual(database.listStarsGiven('viewer').map((record) => record.repo.id), [1]);
      assert.equal(database.listStarsGiven('viewer')[0].createdAt, before.createdAt);
      assert.equal(database.listStarsGiven('viewer')[0].repo.isAvailable, !hidden);
      assert.equal(db.prepare('SELECT count(*) AS n FROM received_star_notifications WHERE repo_id = 1').get().n, 1);
      assert.equal(database.listRepos().some((repo) => repo.id === 1), !hidden);
      assert.equal(database.listReposBySubmitter('owner').length, 2);
      if (path === 'page') assert.equal(result.ok, hidden);
      else assert.equal(result.availability.errors.length, hidden ? 0 : 1);
    });
  }
}

test('restoring public visibility makes the same repository discoverable without duplicating history', async (t) => {
  seed();
  db.prepare('UPDATE repos SET is_available = 0 WHERE id = 1').run();
  const before = database.listStarsGiven('viewer')[0].createdAt;
  t.mock.method(globalThis, 'fetch', async (url) => Response.json(publicRepositoryFixture(url)));
  const result = await syncRepositoryAvailability(db);
  assert.deepEqual(result.restored, ['bob/one']);
  assert.equal(database.listRepos().length, 2);
  assert.equal(database.listStarsGiven('viewer').length, 2);
  assert.equal(database.listStarsGiven('viewer')[0].createdAt, before);
  assert.equal(database.getStats().repos, 2);
});

test('failed recheck does not restore a hidden repository', async (t) => {
  seed();
  db.exec('UPDATE repos SET is_available = 0');
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 500 }));
  const result = await syncRepositoryAvailability(db);
  assert.equal(result.verifiedRepoIds.length, 0);
  assert.equal(database.listRepos().length, 0);
  assert.equal(database.listStarsReceived('owner').length, 2);
});

test('dry-run checks an old schema without changing data or migrating it', async (t) => {
  const old = new DatabaseSync(':memory:');
  t.after(() => old.close());
  old.exec("CREATE TABLE repos (id INTEGER, full_name TEXT); INSERT INTO repos VALUES (1, 'bob/one')");
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const result = await syncRepositoryAvailability(old, { dryRun: true });
  assert.deepEqual(result.unavailable, ['bob/one']);
  assert.deepEqual(old.prepare('PRAGMA table_info(repos)').all().map((column) => column.name), ['id', 'full_name']);
  assert.equal(old.prepare('SELECT count(*) AS n FROM repos').get().n, 1);
});

test('a newer visibility check wins over an older in-flight public response', async (t) => {
  seed();
  t.mock.method(globalThis, 'fetch', async (url) => {
    db.prepare("UPDATE repos SET is_available = 0, availability_checked_at = '2099-01-01T00:00:00.000Z' WHERE id = 1").run();
    return Response.json(publicRepositoryFixture(url));
  });
  const result = await syncRepositoryAvailability(db, { repoIds: [1] });
  assert.equal(database.getRepoById(1).isAvailable, false);
  assert.deepEqual(result.verifiedRepoIds, []);
});

test('private repositories cannot be newly imported even when a token can read them', async (t) => {
  seed();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ private: true }));
  assert.equal(await fetchRepo('bob', 'private', 'synthetic-token'), null);
  const result = await syncRepositoryRows({ databasePath: process.env.DATABASE_PATH,
    sourceRows: [{ repo: 'bob/private', xhsName: null }] });
  assert.deepEqual(result.inserted, []);
  assert.equal(database.getRepoByFullName('bob/private'), null);
});
