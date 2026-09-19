import assert from "node:assert/strict";
import test from "node:test";
import { GitHubRateLimitError, listUserStarredRepos } from "../../src/lib/github.ts";

test("retries a non-rate-limit 403 through the public endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const authorizations = [];
  globalThis.fetch = async (_url, options) => {
    authorizations.push(options.headers.Authorization ?? null);
    if (authorizations.length === 1) {
      return new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
        status: 403,
        headers: { "content-type": "application/json", "x-ratelimit-remaining": "4999" },
      });
    }
    return new Response(
      JSON.stringify([{ starred_at: "2026-09-04T10:00:00Z", repo: { id: 1001, full_name: "owner/repo" } }]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const stars = await listUserStarredRepos("alice", "old-token");
    assert.deepEqual(authorizations, ["Bearer old-token", null]);
    assert.deepEqual(stars, [{ githubId: '1001', fullName: "owner/repo", starredAt: "2026-09-04T10:00:00Z" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a secondary-rate-limit 403", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ message: "You have exceeded a secondary rate limit" }), {
      status: 403,
      headers: { "content-type": "application/json", "x-ratelimit-remaining": "4999" },
    });
  };

  try {
    await assert.rejects(
      () => listUserStarredRepos("alice", "valid-token"),
      (error) => error instanceof GitHubRateLimitError && error.retryAfterMs >= 60_000 && !error.primary,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("marks primary quota exhaustion as safe for a different token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
    status: 403,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 60),
    },
  });

  try {
    await assert.rejects(
      () => listUserStarredRepos("alice", "exhausted-token"),
      (error) => error instanceof GitHubRateLimitError && error.primary,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
