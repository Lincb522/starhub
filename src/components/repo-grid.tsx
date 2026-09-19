"use client";

import { useState } from "react";
import { RepoCard, type Viewer } from "@/components/repo-card";
import type { RepoWithStars } from "@/lib/db";
import { repoPersonId } from "@/lib/repo-person";

export function RepoGrid({ repos, viewer, todo, emptyMessage, starrersOfViewer }: {
  repos: RepoWithStars[];
  viewer: Viewer | null;
  todo: boolean;
  emptyMessage: string;
  /** 给我的仓库点过 Star 的成员 id */
  starrersOfViewer: string[];
}) {
  const [confirmed, setConfirmed] = useState<Map<number, string>>(() => new Map());
  // Keep successful actions across stale refreshes until this view is left.
  const visible = todo ? repos.filter((repo) => !confirmed.has(repo.id)
    && !repo.stars.some((star) => star.user.id === viewer?.id)) : repos;

  if (visible.length === 0) {
    return <div className="glass mt-6 rounded-2xl px-6 py-16 text-center text-fg/50" role="status">{emptyMessage}</div>;
  }

  return (
    <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      {visible.map((repo) => {
        const createdAt = confirmed.get(repo.id);
        const displayRepo = createdAt && viewer && !repo.stars.some((star) => star.user.id === viewer.id)
          ? { ...repo, stars: [...repo.stars, { createdAt,
              user: { id: viewer.id, login: viewer.login, avatarUrl: null, xhsName: null } }] } : repo;
        return (
          <RepoCard key={repo.id} repo={displayRepo} viewer={viewer}
            ownerStarredViewer={starrersOfViewer.includes(repoPersonId(repo))}
            onStarred={() => setConfirmed((current) => new Map(current).set(repo.id, new Date().toISOString()))}
          />
        );
      })}
    </div>
  );
}
