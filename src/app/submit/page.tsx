import { redirect } from "next/navigation";
import { getCurrentUser, inviteRequired } from "@/lib/current-user";
import { SubmitForm } from "@/components/submit-form";
import { listReposBySubmitter, listUnreadReceivedStars } from "@/lib/db";
import { RepoCard } from "@/components/repo-card";
import { GitHubSyncWarning } from "@/components/github-sync-warning";
import { syncGitHubStarTruth } from "@/lib/github-star-sync";
import { ReceivedStarAlert } from "@/components/received-star-alert";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (!user.approved && inviteRequired()) redirect("/join");

  const starSync = await syncGitHubStarTruth(user);
  const mine = listReposBySubmitter(user.id);
  const receivedAlert = listUnreadReceivedStars(user.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />
      <h1 className="text-3xl font-bold tracking-tight">录入仓库</h1>
      <p className="mt-1.5 text-sm text-fg/50">
        支持 GitHub 链接或 <code className="rounded bg-fg/10 px-1.5 py-0.5 font-mono text-xs">owner/repo</code>，仓库信息自动获取。
      </p>

      {!starSync.ok && (
        <GitHubSyncWarning message={starSync.message} reauthorize={starSync.code === "REAUTH"} next="/submit" />
      )}

      <div className="glass mt-8 rounded-2xl p-6">
        <SubmitForm defaultOwner={user.login} defaultXhs={user.xhsName ?? ""} />
      </div>

      {mine.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">已录入 · {mine.length}</h2>
          <div className="mt-4 grid gap-4">
            {mine.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                viewer={{ id: user.id, login: user.login, isAdmin: user.isAdmin, canStar: user.canStar }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
