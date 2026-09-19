import Link from "next/link";
import { History, Plus, Star } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { GitHubSyncWarning } from "@/components/github-sync-warning";
import { ReceivedStarAlert } from "@/components/received-star-alert";
import { RepoDeck } from "@/components/repo-deck";
import type { ReceivedStarNotification, RepoWithStars, StarRecord } from "@/lib/db";

type Member = {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  canStar: boolean;
};

type SyncResult =
  | { ok: true }
  | { ok: false; code?: string; message: string }
  | null;

type Props = {
  user: Member;
  repos: RepoWithStars[];
  doneCount: number;
  mineCount: number;
  received: StarRecord[];
  starrersOfViewer: string[];
  stats: { members: number; repos: number; stars: number };
  starSync: SyncResult;
  receivedAlert: { total: number; ids: number[]; items: ReceivedStarNotification[] } | null;
};

export function MemberHome({
  user,
  repos,
  doneCount,
  mineCount,
  received,
  starrersOfViewer,
  stats,
  starSync,
  receivedAlert,
}: Props) {
  const displayName = user.name?.trim() || user.login;
  const recentReceived = received.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-11">
      {receivedAlert && <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />}

      <header className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar src={user.avatarUrl} alt={user.login} size={52} className="shrink-0 ring-1 ring-line-strong" />
          <div className="min-w-0">
            <p className="eyebrow">今日浏览</p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight sm:text-3xl" title={displayName}>
              欢迎回来，{displayName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {repos.length > 0 ? `还有 ${repos.length} 个仓库等你浏览。` : "待 Star 队列已经清空。"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/history" className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold">
            <History className="size-4" />
            记录
          </Link>
          <Link href="/submit" className="btn-star inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold">
            <Plus className="size-4" strokeWidth={2.5} />
            录入仓库
          </Link>
        </div>
      </header>

      {starSync && !starSync.ok && (
        <GitHubSyncWarning message={starSync.message} reauthorize={starSync.code === "REAUTH"} next="/" />
      )}

      <dl className="mt-8 grid grid-cols-2 border-y border-line sm:grid-cols-4">
        <Metric label="待 Star" value={repos.length} />
        <Metric label="我已 Star" value={doneCount} bordered />
        <Metric label="收到 Star" value={received.length} />
        <Metric label="我的仓库" value={mineCount} bordered />
      </dl>

      <div className="mt-9 grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-12">
        <section className="min-w-0" aria-labelledby="star-queue-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Star Queue</p>
              <h2 id="star-queue-title" className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                待 Star 仓库
              </h2>
            </div>
            <p className="hidden text-xs text-faint sm:block">左滑 Star · 右滑下一张</p>
          </div>

          <RepoDeck
            key={user.id}
            repos={repos}
            canStar={user.canStar}
            mineCount={mineCount}
            doneCount={doneCount}
            starrersOfViewer={starrersOfViewer}
            embedded
          />
        </section>

        <aside className="min-w-0 space-y-9 lg:sticky lg:top-24" aria-label="首页辅助信息">
          <section aria-labelledby="community-title" className="border-y border-line py-4">
            <p className="eyebrow">Community</p>
            <h2 id="community-title" className="mt-1 text-sm font-bold tracking-tight">社区概览</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {stats.members} 位成员正在分享 {stats.repos} 个仓库，已经完成 {stats.stars} 次 Star。
            </p>
          </section>

          <section aria-labelledby="recent-stars-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="recent-stars-title" className="text-sm font-bold tracking-tight">最近收到</h2>
              {received.length > 0 && (
                <Link href="/history" className="text-xs font-semibold text-muted transition hover:text-fg">全部</Link>
              )}
            </div>

            {recentReceived.length > 0 ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {recentReceived.map((item) => (
                  <li key={item.id} className="flex min-w-0 items-center gap-3 py-3">
                    <Avatar src={item.user.avatarUrl} alt={item.user.login} size={34} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" title={item.user.login}>{item.user.login}</p>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
                        <Star className="size-3 shrink-0 fill-coral text-coral" />
                        <span className="truncate" title={item.repo.fullName}>{item.repo.fullName}</span>
                      </p>
                      {!item.repo.isAvailable && <p className="mt-1 text-xs text-muted">仓库暂不可访问</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-y border-line py-4 text-sm leading-relaxed text-muted">
                还没有收到 Star。录入仓库后，其他成员就能看到它。
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, bordered = false }: { label: string; value: number; bordered?: boolean }) {
  return (
    <div className={`px-3 py-4 sm:px-5 ${bordered ? "border-l border-line" : ""}`}>
      <dd className="text-xl font-bold tabular-nums sm:text-2xl">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </div>
  );
}
