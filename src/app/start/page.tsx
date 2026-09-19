import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCurrentUser, inviteRequired } from "@/lib/current-user";
import { listReposBySubmitter } from "@/lib/db";
import { getStats } from "@/lib/queries";
import { SubmitForm } from "@/components/submit-form";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";

/**
 * 登录后的落地页：未录入仓库的用户先在这里录入，已录入的直接进入浏览。
 */
export default async function StartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/start");
  if (!user.approved && inviteRequired()) redirect("/join");

  const mine = listReposBySubmitter(user.id);
  if (mine.length > 0 && user.xhsName) redirect("/");

  const stats = getStats();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Avatar src={user.avatarUrl} alt={user.login} size={72} className="ring-1 ring-line-strong" />
        <h1 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {mine.length === 0 ? "录入仓库" : "补充小红书账号"}
        </h1>
        <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-fg/55">
          {mine.length === 0
            ? `当前 ${stats.members} 人、${stats.repos} 个仓库。录入仓库与小红书账号后，其他人可以为你的仓库 Star。`
            : "仓库已录入，补充小红书账号后完成。"}
        </p>
      </div>

      <div className="glass w-full rounded-3xl p-6 sm:p-8">
        <SubmitForm defaultOwner={user.login} defaultXhs={user.xhsName ?? ""} onboarding />
      </div>

      <Link href="/repos" className="mt-6 inline-flex items-center gap-1 text-sm text-fg/40 transition hover:text-fg/80">
        先浏览仓库 <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
