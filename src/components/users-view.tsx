import Link from "next/link";
import { ChevronRight, Star, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { XhsBadge } from "@/components/xhs-badge";
import type { UserBrief } from "@/lib/db";

export type UserGroup = {
  user: UserBrief;
  repoCount: number;
  starCount: number;
};

/** 「按用户」视图：只列出录入过仓库的成员，点进去再看 TA 录入的仓库 */
export function UsersView({ groups }: { groups: UserGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="glass mt-6 rounded-2xl px-6 py-16 text-center text-fg/50" role="status">
        还没有成员录入仓库
      </div>
    );
  }

  return (
    <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map(({ user, repoCount, starCount }) => (
        <Link
          key={user.id}
          href={`/repos?view=users&user=${encodeURIComponent(user.id)}`}
          className="glass card-hover flex min-w-0 items-center gap-3 rounded-2xl p-4"
        >
          <Avatar src={user.avatarUrl} alt={user.login} size={44} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-fg" title={user.login}>
              {user.login}
            </p>
            <XhsBadge name={user.xhsName} className="mt-1" />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg/55">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {repoCount} 个仓库
              </span>
              <span className="inline-flex items-center gap-1 text-coral">
                <Star className="size-3.5" />
                {starCount} 次被 Star
              </span>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-fg/30" />
        </Link>
      ))}
    </div>
  );
}
