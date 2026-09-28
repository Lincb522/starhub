import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Star } from "lucide-react";
import { signIn } from "@/auth";
import { getCurrentUser, inviteRequired } from "@/lib/current-user";
import { collectStarrersOfViewer, getStats, listRepos, sortForViewer } from "@/lib/queries";
import { groupReposForViewer } from "@/lib/repo-person";
import { listReposBySubmitter, listStarsGiven, listStarsReceived, listUnreadReceivedStars } from "@/lib/db";
import { syncGitHubStarTruth } from "@/lib/github-star-sync";
import { LoginWithNotice } from "@/components/login-with-notice";
import { MemberHome } from "@/components/member-home";
import { RepoCard } from "@/components/repo-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    if (!user.approved && inviteRequired()) redirect("/join");

    const mine = listReposBySubmitter(user.id);
    if (mine.length === 0 || !user.xhsName) redirect("/start");

    const starSync = await syncGitHubStarTruth(user);
    const repos = listRepos();
    const viewer = { id: user.id, login: user.login };
    const doneIds = new Set(listStarsGiven(user.id).map((record) => record.personId));
    const groups = groupReposForViewer(sortForViewer(repos, viewer), viewer.id);
    const todo = groups.filter((group) => !group.starred && !doneIds.has(group.personId));
    const doneCount = doneIds.size;
    const received = listStarsReceived(user.id);
    const receivedAlert = listUnreadReceivedStars(user.id);
    const starrersOfViewer = collectStarrersOfViewer(repos, viewer);

    return (
      <MemberHome
        user={user}
        groups={todo}
        doneCount={doneCount}
        mineCount={mine.length}
        received={received}
        starrersOfViewer={starrersOfViewer}
        stats={getStats()}
        starSync={starSync}
        receivedAlert={receivedAlert}
      />
    );
  }

  const [stats, repos] = await Promise.all([getStats(), listRepos()]);
  const latest = repos.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center pb-16 text-center">
        <span className="pill">
          <span className="dot-coral" />
          {stats.members} 人 · {stats.repos} 个仓库 · {stats.stars} 次 Star
        </span>

        <div className="relative mt-14 grid size-28 place-items-center sm:size-32">
          <Star className="size-full text-fg" strokeWidth={1.4} />
          <span className="absolute bottom-1 right-1 size-5 rounded-full bg-coral ring-[6px] ring-bg sm:size-6" />
        </div>

        <p className="eyebrow mt-12">GitHub · Star</p>
        <h1 className="mt-4 text-balance text-2xl font-semibold tracking-[0.08em] text-fg sm:text-3xl">危楼高百尺，手可摘星辰</h1>
        <p className="mt-4 text-sm text-muted">GitHub 登录，录入仓库与小红书账号，浏览仓库并 Star。</p>

        <div className="actions mt-6 w-full max-w-[430px]">
          <LoginWithNotice
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/start" });
            }}
          />
          <Link href="/repos" className="btn-ghost flex h-11 flex-1 items-center justify-center gap-1.5 px-5 text-sm font-semibold">
            浏览仓库
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {latest.length > 0 && (
        <section className="panel-strong mb-12 rounded-3xl p-5 sm:p-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="eyebrow">Latest</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">最新录入</h2>
            </div>
            <Link href="/repos" className="text-xs font-semibold text-muted transition hover:text-fg">
              全部 ↗
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {latest.map((repo) => (
              <RepoCard key={repo.id} repo={repo} viewer={null} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
