import Link from "next/link";
import { ChevronLeft, Layers, LayoutGrid, Plus, Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { getCurrentUser, inviteRequired } from "@/lib/current-user";
import { listReposBySubmitter, listStarsGiven, listUnreadReceivedStars, type RepoWithStars, type UserBrief } from "@/lib/db";
import { collectStarrersOfViewer, filterForViewer, listRepos, sortForViewer, type RepoFilter } from "@/lib/queries";
import { groupReposForViewer, repoPersonId } from "@/lib/repo-person";
import type { Viewer } from "@/components/repo-card";
import { RepoGrid } from "@/components/repo-grid";
import { RepoDeck } from "@/components/repo-deck";
import { UsersView, type UserGroup } from "@/components/users-view";
import { JoinBanner } from "@/components/join-banner";
import { GitHubSyncWarning } from "@/components/github-sync-warning";
import { syncGitHubStarTruth } from "@/lib/github-star-sync";
import { ReceivedStarAlert } from "@/components/received-star-alert";

export const dynamic = "force-dynamic";

const tabs: { key: RepoFilter; label: string; authOnly?: boolean }[] = [
  { key: "todo", label: "未 Star", authOnly: true },
  { key: "all", label: "全部" },
  { key: "done", label: "已 Star", authOnly: true },
  { key: "mine", label: "我的", authOnly: true },
];

export default async function ReposPage({ searchParams }: PageProps<"/repos">) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const starSync = user ? await syncGitHubStarTruth(user) : null;
  const receivedAlert = user?.approved ? listUnreadReceivedStars(user.id) : null;
  const repos = listRepos();
  const viewer: Viewer | null = user ? { id: user.id, login: user.login, isAdmin: user.isAdmin, canStar: user.canStar } : null;
  const member = Boolean(user?.approved || (user && !inviteRequired()));
  const view = sp.view === "users" ? "users" : sp.view === "grid" || !member ? "grid" : "deck";
  const starrersOfViewer = viewer ? collectStarrersOfViewer(repos, viewer) : [];

  if (view === "deck" && user && viewer) {
    const doneIds = new Set(listStarsGiven(user.id).map((record) => record.personId));
    const groups = groupReposForViewer(sortForViewer(repos, viewer), viewer.id);
    const todo = groups.filter((group) => !group.starred && !doneIds.has(group.personId));
    const doneCount = doneIds.size;
    const mineCount = listReposBySubmitter(user.id).length;
    return (
      <div className="mx-auto max-w-6xl px-6">
        {receivedAlert && <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />}
        <div className="flex items-center justify-between pt-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">浏览</h1>
            <p className="mt-1 text-sm text-fg/50">逐个浏览用户，选择项目后 Star 或跳过。</p>
          </div>
          <Link href="/repos?view=grid" className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fg/70">
            <LayoutGrid className="size-4" />
            <span className="hidden sm:inline">全部仓库</span>
          </Link>
        </div>
        {starSync && !starSync.ok && (
          <GitHubSyncWarning message={starSync.message} reauthorize={starSync.code === "REAUTH"} next="/repos" />
        )}
        <RepoDeck
          key={user.id}
          groups={todo}
          canStar={user.canStar}
          mineCount={mineCount}
          doneCount={doneCount}
          starrersOfViewer={starrersOfViewer}
        />
      </div>
    );
  }

  if (view === "users") {
    const groups = new Map<string, { user: UserBrief; repos: RepoWithStars[] }>();
    for (const repo of repos) {
      const personId = repoPersonId(repo);
      const group = groups.get(personId) ?? { user: repo.person, repos: [] };
      group.repos.push(repo);
      groups.set(personId, group);
    }
    const selectedId = typeof sp.user === "string" ? sp.user : undefined;
    const selected = selectedId ? groups.get(selectedId) : undefined;

    if (selected) {
      return (
        <div className="mx-auto max-w-6xl px-6 py-12">
          {receivedAlert && <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />}
          <Link href="/repos?view=users" className="inline-flex items-center gap-1 text-sm text-fg/55 transition hover:text-fg">
            <ChevronLeft className="size-4" />
            按用户浏览
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <Avatar src={selected.user.avatarUrl} alt={selected.user.login} size={48} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight" title={selected.user.login}>
                {selected.user.login}
              </h1>
              <p className="mt-1 text-sm text-fg/50">{selected.repos.length} 个仓库</p>
            </div>
          </div>
          <RepoGrid
            key={`${selected.user.id}:user-repos`}
            repos={selected.repos}
            viewer={viewer}
            todo={false}
            emptyMessage="该用户暂无仓库"
            starrersOfViewer={starrersOfViewer}
          />
        </div>
      );
    }

    const userGroups: UserGroup[] = [...groups.values()]
      .map((group) => ({
        user: group.user,
        repoCount: group.repos.length,
        starCount: group.repos.reduce((sum, repo) => sum + repo.stars.length, 0),
      }))
      .sort((a, b) => b.repoCount - a.repoCount || b.starCount - a.starCount);

    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        {receivedAlert && <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">按用户浏览</h1>
            <p className="mt-1.5 text-sm text-fg/50">{userGroups.length} 位成员，点开查看各自录入的仓库</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Link href="/repos?view=grid" className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-fg/80">
              <LayoutGrid className="size-4" />
              全部仓库
            </Link>
            {member && (
              <Link href="/repos" className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-fg/80">
                <Layers className="size-4" />
                逐个浏览
              </Link>
            )}
          </div>
        </div>
        <UsersView groups={userGroups} />
      </div>
    );
  }

  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const requested = typeof sp.filter === "string" ? (sp.filter as RepoFilter) : undefined;
  const filter: RepoFilter = viewer ? requested ?? "all" : "all";

  const mine = viewer ? listReposBySubmitter(viewer.id) : [];
  let list = filter === "mine" ? mine : filterForViewer(sortForViewer(repos, viewer), viewer, filter);
  if (q) {
    list = list.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.language ?? "").toLowerCase().includes(q) ||
        (r.person.xhsName ?? "").toLowerCase().includes(q),
    );
  }

  const counts = {
    all: viewer ? filterForViewer(repos, viewer, "all").length : repos.length,
    todo: viewer ? filterForViewer(repos, viewer, "todo").length : 0,
    done: viewer ? filterForViewer(repos, viewer, "done").length : 0,
    mine: mine.length,
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {receivedAlert && <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">全部仓库</h1>
          <p className="mt-1.5 text-sm text-fg/50">
            {viewer ? `${counts.todo} 个未 Star` : "登录后可直接 Star"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Link href="/repos?view=users" className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-fg/80">
            <Users className="size-4" />
            按用户
          </Link>
          {member && (
            <Link href="/repos" className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-fg/80">
              <Layers className="size-4" />
              逐个浏览
            </Link>
          )}
          {member && (
            <Link href="/submit" className="btn-star inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold">
              <Plus className="size-4" strokeWidth={2.5} />
              录入仓库
            </Link>
          )}
        </div>
      </div>

      {user && !user.approved && inviteRequired() && <JoinBanner />}
      {starSync && !starSync.ok && (
        <GitHubSyncWarning
          message={starSync.message}
          reauthorize={starSync.code === "REAUTH"}
          next="/repos?view=grid"
        />
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl border border-fg/10 bg-fg/[0.03] p-1">
          {tabs
            .filter((t) => !t.authOnly || viewer)
            .map((t) => {
              const active = filter === t.key;
              const href = `/repos?view=grid&filter=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
              return (
                <Link
                  key={t.key}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm transition ${
                    active ? "bg-fg/10 text-fg shadow-inner" : "text-fg/55 hover:text-fg"
                  }`}
                >
                  {t.label}
                  <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-coral/10 text-coral" : "bg-fg/5"}`}>
                    {counts[t.key]}
                  </span>
                </Link>
              );
            })}
        </div>

        <form className="relative" action="/repos">
          <input type="hidden" name="view" value="grid" />
          <input type="hidden" name="filter" value={filter} />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg/40" />
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索仓库、语言、小红书"
            className="w-full rounded-xl border border-fg/10 bg-fg/[0.03] py-2 pl-9 pr-3 text-sm placeholder:text-fg/30 sm:w-64"
          />
        </form>
      </div>

      <RepoGrid key={`${viewer?.id ?? "guest"}:${filter}:${q}`} repos={list} viewer={viewer}
        todo={filter === "todo"} emptyMessage={filter === "todo" && !q ? "全部已 Star" : "无匹配结果"}
        starrersOfViewer={starrersOfViewer} />
    </div>
  );
}
