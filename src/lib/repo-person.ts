// 单一实现在 scripts/lib/repo-person.mjs（供 db.ts、脚本、测试用 Node 直接加载）。
import { repoPersonId } from "../../scripts/lib/repo-person.mjs";

export { repoPersonId };

type PersonRepo = {
  id: number;
  ownerUserId: string | null;
  submitterId: string;
  stars: { user: { id: string } }[];
};

export type PersonGroup<T> = { personId: string; repos: T[]; starred: boolean };

/** 一个用户只占一个待 Star 位置；其任意仓库已 Star 就算完成。 */
export function groupReposForViewer<T extends PersonRepo>(repos: T[], viewerId: string): PersonGroup<T>[] {
  const groups = new Map<string, PersonGroup<T>>();
  const seenRepos = new Set<number>();
  for (const repo of repos) {
    if (seenRepos.has(repo.id)) continue;
    seenRepos.add(repo.id);
    const personId = repoPersonId(repo);
    if (personId === viewerId || repo.submitterId === viewerId) continue;
    let group = groups.get(personId);
    if (!group) {
      group = { personId, repos: [], starred: false };
      groups.set(personId, group);
    }
    group.repos.push(repo);
    if (repo.stars.some((star) => star.user.id === viewerId)) group.starred = true;
  }
  return [...groups.values()];
}
