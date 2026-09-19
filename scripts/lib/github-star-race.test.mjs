import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import { syncGitHubStarRecords } from "./github-star-sync.mjs";
import { publicRepositoryFixture } from './github-repo-fixture.mjs';

const directory = mkdtempSync(join(tmpdir(), "starhub-race-"));
process.env.DATABASE_PATH = join(directory, "starhub.db");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const database = await import("../../src/lib/db.ts");
const { syncGitHubStarTruth } = await import("../../src/lib/github-star-sync.ts");
const { db } = database;
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

for (const path of ["page", "scheduled"]) {
  for (const existing of [false, true]) {
    test(`${path} sync preserves a ${existing ? "reconfirmed" : "new"} Star written while GitHub is being read`, async (t) => {
      db.exec(`
        DELETE FROM sync_state;
        DELETE FROM users;
        INSERT INTO users (id, login) VALUES ('viewer', 'alice'), ('owner', 'bob');
        INSERT INTO repos (id, full_name, owner, name, html_url, submitter_id)
          VALUES (1, 'bob/one', 'bob', 'one', 'https://github.com/bob/one', 'owner'),
                 (2, 'bob/two', 'bob', 'two', 'https://github.com/bob/two', 'owner');
      `);
      delete globalThis.__starhubGitHubStarSyncFailure;
      if (existing) database.upsertStar("viewer", 1);
      database.upsertStar("viewer", 2);
      let mutationDone = false;
      t.mock.method(globalThis, "fetch", async (url) => {
        if (/^\/(repos|repositories)\//.test(new URL(String(url)).pathname)) return Response.json(publicRepositoryFixture(url));
        if (!mutationDone) {
          mutationDone = true;
          database.upsertStar("viewer", 1);
        }
        return new Response("[]", { status: 200 });
      });
      const sync = () => path === "page"
        ? syncGitHubStarTruth({ id: "viewer", login: "alice" }, { blocking: true })
        : syncGitHubStarRecords({ databasePath: process.env.DATABASE_PATH });
      const first = await sync();
      assert.notEqual(first.ok, false);
      assert.deepEqual(db.prepare("SELECT repo_id FROM stars WHERE user_id = 'viewer'").all().map(row => row.repo_id), [1]);
      assert.deepEqual(db.prepare("SELECT repo_id FROM received_star_notifications").all().map(row => row.repo_id), [1]);
      assert.equal(first.total, 1);

      // A later complete snapshot can still remove a genuine GitHub unstar.
      db.exec("DELETE FROM sync_state");
      await sync();
      assert.equal(db.prepare("SELECT count(*) AS n FROM stars").get().n, 0);
      assert.equal(db.prepare("SELECT count(*) AS n FROM received_star_notifications").get().n, 0);
    });
  }
}
