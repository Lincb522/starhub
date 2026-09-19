import * as db from "@/lib/db";
import { GitHubRateLimitError, listUserStarredRepos, NeedReauthError } from "@/lib/github";
import { syncRepositoryAvailability } from "../../scripts/lib/repo-availability.mjs";

export type GitHubStarSyncResult =
  | { ok: true; added: number; removed: number; total: number }
  | {
      ok: false;
      message: string;
      code?: "REAUTH" | "RATE_LIMIT";
      retryAfterMs?: number;
      alternateTokenSafe?: boolean;
    };

type SyncGlobal = typeof globalThis & {
  __starhubGitHubStarSync?: Promise<GitHubStarSyncResult>;
  __starhubGitHubStarSyncFailure?: { until: number; result: GitHubStarSyncResult & { ok: false } };
};

type SyncUser = { id: string; login: string };
const FULL_SYNC_MAX_AGE_MS = 5 * 60 * 1000;

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
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

async function reconcileUsers(users: SyncUser[], token?: string): Promise<GitHubStarSyncResult> {
  try {
    const userIds = users.map((user) => user.id);
    const baseline = db.snapshotGitHubStars(userIds);
    const availability = await syncRepositoryAvailability(db.db, { token });
    if (availability.purged.length > 0) {
      console.log(JSON.stringify({ event: "repos-purged", reason: "持续失效超过宽限期", repos: availability.purged }));
    }
    if (availability.purgeSkipped) console.warn(JSON.stringify({ event: "repos-purge-skipped", reason: availability.purgeSkipped }));
    const repoIds = new Map(availability.identities.map((repo) => [repo.githubId, repo.repoId]));
    // 仓库 GitHub owner id 与本站用户 id 同源（都是 GitHub 用户 id）
    const ownerIdByRepo = new Map(availability.identities.map((repo) => [repo.repoId, repo.ownerId]));
    const submitterByRepo = db.mapRepoSubmitters();
    const currentUsers = db.listUsersForStarSync().filter((user) => userIds.includes(user.id));
    const snapshots = await mapWithConcurrency(currentUsers, 4, async (user) => ({
      user,
      stars: await listUserStarredRepos(user.login, token),
    }));

    const entries: db.GitHubStarTruth[] = [];
    for (const { user, stars } of snapshots) {
      for (const star of stars) {
        const repoId = repoIds.get(star.githubId);
        if (!repoId) continue;
        // 自己 Star 自己的仓库（owner 或录入者是自己）不算互点，不写入本站记录
        if (ownerIdByRepo.get(repoId) === user.id || submitterByRepo.get(repoId) === user.id) continue;
        entries.push({ userId: user.id, repoId, starredAt: star.starredAt });
      }
    }

    const result = db.reconcileGitHubStars(entries, userIds, baseline, availability.verifiedRepoIds);
    if (availability.errors.length > 0) {
      return { ok: false, message: "部分仓库状态核验失败，相关 Star 记录已保留，请稍后重试" };
    }
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "GitHub Star 状态同步失败",
      ...(error instanceof NeedReauthError ? { code: "REAUTH" as const } : {}),
      ...(error instanceof GitHubRateLimitError
        ? {
            code: "RATE_LIMIT" as const,
            retryAfterMs: error.retryAfterMs,
            alternateTokenSafe: error.primary,
          }
        : {}),
    };
  }
}

async function runFullSync(token?: string): Promise<GitHubStarSyncResult> {
  const result = await reconcileUsers(db.listUsersForStarSync(), token);
  if (result.ok) db.markGitHubStarsSynced();
  return result;
}

async function runFullSyncWithFallback(tokens: (string | undefined)[]): Promise<GitHubStarSyncResult> {
  let result: GitHubStarSyncResult = { ok: false, message: "GitHub Star 状态同步失败" };
  for (let index = 0; index < tokens.length; index++) {
    result = await runFullSync(tokens[index]);
    if (result.ok || !result.alternateTokenSafe || index === tokens.length - 1) return result;
  }
  return result;
}

/**
 * 页面展示前从 GitHub 拉取真实 Star 关系并原子对账。
 * 同一进程中的并发请求共用一次同步，避免重复消耗 GitHub API 额度。
 */
export async function syncGitHubStarTruth(
  viewer: { id: string; login: string; accessToken?: string },
  /** blocking=true 时等待本轮同步完成并返回真实结果（脚本 / 测试用）；页面默认不等待 */
  { blocking = false }: { blocking?: boolean } = {},
): Promise<GitHubStarSyncResult> {
  const readTokens = [...new Set([process.env.GITHUB_TOKEN, viewer.accessToken].filter(Boolean))] as string[];
  const tokens: (string | undefined)[] = readTokens.length > 0 ? readTokens : [undefined];
  const global = globalThis as SyncGlobal;

  // 数据仍在有效期内，直接用库中已对账的数据渲染
  if (db.isGitHubStarSyncFresh(FULL_SYNC_MAX_AGE_MS)) {
    return { ok: true, added: 0, removed: 0, total: db.getStats().stars };
  }

  // 最近一次同步失败：返回失败态用于页面提示，同时避免频繁重试
  if (global.__starhubGitHubStarSyncFailure) {
    if (Date.now() < global.__starhubGitHubStarSyncFailure.until) {
      return global.__starhubGitHubStarSyncFailure.result;
    }
    delete global.__starhubGitHubStarSyncFailure;
  }

  // 需要刷新时：在后台触发一次全量同步（进程内单飞），本次请求不再 await。
  // 页面立即用当前库中的数据渲染，同步在后台完成，避免每隔几分钟就有访客被迫
  // 等待整轮「全部用户 × 全部仓库」的 GitHub 同步——这正是此前进页面很慢的根因。
  let promise = global.__starhubGitHubStarSync;
  if (!promise) {
    // 失败记录与单飞状态复位都放在任务自身的 finally 里，保证 blocking 调用方 await 返回时状态已经收尾
    const handle: { current?: Promise<GitHubStarSyncResult> } = {};
    const started = (async () => {
      try {
        const result = await runFullSyncWithFallback(tokens);
        if (result.ok) {
          delete global.__starhubGitHubStarSyncFailure;
        } else {
          global.__starhubGitHubStarSyncFailure = {
            until: Date.now() + (result.retryAfterMs ?? 60_000),
            result,
          };
        }
        return result;
      } finally {
        if (global.__starhubGitHubStarSync === handle.current) delete global.__starhubGitHubStarSync;
      }
    })();
    handle.current = started;
    promise = started;
    global.__starhubGitHubStarSync = started;
    void started.catch(() => {});
  }

  if (blocking) return promise;
  return { ok: true, added: 0, removed: 0, total: db.getStats().stars };
}
