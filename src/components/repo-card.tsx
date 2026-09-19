import { ArrowLeftRight, Star, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LanguageBadge } from "@/components/language-badge";
import { StarButton } from "@/components/star-button";
import { XhsBadge } from "@/components/xhs-badge";
import { StarDetails } from "@/components/star-details";
import type { RepoWithStars } from "@/lib/db";

export type Viewer = { id: string; login: string; isAdmin: boolean; canStar: boolean };

export function RepoCard({
  repo,
  viewer,
  ownerStarredViewer = false,
  onStarred,
}: {
  repo: RepoWithStars;
  viewer: Viewer | null;
  ownerStarredViewer?: boolean;
  onStarred?: () => void;
}) {
  const starred = viewer ? repo.stars.some((s) => s.user.id === viewer.id) : false;
  const isOwn = viewer ? repo.owner.toLowerCase() === viewer.login.toLowerCase() : false;
  const canDelete = viewer ? repo.submitterId === viewer.id || viewer.isAdmin : false;
  const groupStars = repo.stars.length;

  const button = (
    <StarButton
      key={viewer?.id ?? "guest"}
      repoId={repo.id}
      htmlUrl={repo.htmlUrl}
      starred={starred}
      isOwn={isOwn}
      canDelete={canDelete}
      loggedIn={Boolean(viewer)}
      canStar={viewer?.canStar ?? false}
      isAvailable={repo.isAvailable}
      onStarred={onStarred}
    />
  );

  return (
    <article className="glass card-hover flex min-w-0 max-w-full flex-col gap-4 rounded-2xl p-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar src={repo.submitter.avatarUrl} alt={repo.owner} size={40} />
          <div className="min-w-0 flex-1">
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-semibold text-fg hover:text-coral"
              title={repo.fullName}
            >
              <span className="text-fg/50">{repo.owner}/</span>
              {repo.name}
            </a>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg/55">{repo.description || "暂无简介"}</p>
            <XhsBadge name={repo.submitter.xhsName} className="mt-2" />
            {!repo.isAvailable && <p className="mt-2 text-xs text-muted">仓库暂不可访问 · 已暂停展示</p>}
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">{button}</div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-xs text-fg/55">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          <LanguageBadge language={repo.language} />
          <span className="flex items-center gap-1" title="GitHub Star 数">
            <Star className="size-3.5" />
            {repo.stargazers.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 text-coral" title="已 Star 人数">
            <Users className="size-3.5" />
            {groupStars} 人已 Star
          </span>
          {ownerStarredViewer && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-fg/5 px-2 py-1 font-medium text-fg/75"
              title={`${repo.owner} 已 Star 过你的仓库`}
            >
              <ArrowLeftRight className="size-3.5 text-coral" />
              {starred ? "已互 Star" : "对方已 Star 你"}
            </span>
          )}
        </div>
        <StarDetails repoFullName={repo.fullName} repoUrl={repo.htmlUrl} stars={repo.stars} />
      </div>

      <div className="sm:hidden">{button}</div>
    </article>
  );
}
