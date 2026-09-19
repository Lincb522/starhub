import { repoPersonId } from "@/lib/repo-person";

export { listRepos, getStats } from "@/lib/db";
export { repoPersonId } from "@/lib/repo-person";

export type RepoFilter = "all" | "todo" | "done" | "mine";

type Sortable = { ownerUserId: string | null; submitterId: string; stars: { user: { id: string } }[] };
type ViewerRef = { id: string };

/** 这个仓库是否算「我的」：owner 是我，或者是我录入的（组织仓库等） */
export const isOwnRepo = (r: { ownerUserId: string | null; submitterId: string }, viewer: ViewerRef): boolean =>
  repoPersonId(r) === viewer.id || r.submitterId === viewer.id;

/**
 * 排序策略：优先展示当前用户未 Star、且已 Star 人数最少的仓库，让 Star 分布更均匀。
 */
export function sortForViewer<T extends Sortable>(repos: T[], viewer: ViewerRef | null): T[] {
  if (!viewer) return repos;
  const done = (r: T) => r.stars.some((s) => s.user.id === viewer.id) || isOwnRepo(r, viewer);
  return [...repos].sort((a, b) => {
    const ad = done(a);
    const bd = done(b);
    if (ad !== bd) return ad ? 1 : -1;
    return a.stars.length - b.stars.length;
  });
}

export function filterForViewer<T extends Sortable>(repos: T[], viewer: ViewerRef | null, filter: RepoFilter): T[] {
  if (!viewer) return repos;
  return repos.filter((r) => {
    const own = isOwnRepo(r, viewer);
    const starred = r.stars.some((s) => s.user.id === viewer.id);
    if (filter === "mine") return own;
    // 「全部」不再展示自己录入 / 拥有的仓库，避免自己的仓库出现在互点列表里
    if (filter === "all") return !own;
    if (filter === "done") return starred;
    return !own && !starred;
  });
}

/**
 * 给「我的仓库」点过 Star 的成员 id 集合（不含我自己）。
 * 卡片用 `includes(repoPersonId(repo))` 判定「对方已 Star 你」，按人而不是按 owner 字符串匹配。
 */
export function collectStarrersOfViewer<T extends Sortable>(repos: T[], viewer: ViewerRef): string[] {
  const ids = new Set<string>();
  for (const repo of repos) {
    if (!isOwnRepo(repo, viewer)) continue;
    for (const star of repo.stars) if (star.user.id !== viewer.id) ids.add(star.user.id);
  }
  return [...ids];
}
