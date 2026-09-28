import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, Star } from "lucide-react";
import { listReposBySubmitter, listStarsGiven, listStarsReceived, type StarRecord, type UserBrief } from "@/lib/db";
import { listRepos, sortForViewer } from "@/lib/queries";
import { groupReposForViewer, repoPersonId } from "@/lib/repo-person";
import { timeAgo } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { LanguageBadge } from "@/components/language-badge";
import { XhsBadge } from "@/components/xhs-badge";
import { GitHubSyncWarning } from "@/components/github-sync-warning";

export function HistoryView({
  user,
  syncError,
}: {
  user: { id: string; login: string };
  syncError: { message: string; reauthorize: boolean } | null;
}) {
  const [given, received, mine, all] = [
    listStarsGiven(user.id),
    listStarsReceived(user.id),
    listReposBySubmitter(user.id),
    listRepos(),
  ];
  const viewer = { id: user.id, login: user.login };

  // 互 Star 关系：我 Star 过谁的仓库 / 谁 Star 过我的仓库。
  // 统一按仓库「属于谁」(personId) 判定，与仓库卡片一致，避免按 owner 字符串匹配带来的误判 / 漏判。
  const iStarred = new Set(given.map((g) => g.personId));
  const todo = groupReposForViewer(sortForViewer(all, viewer), viewer.id)
    .filter((group) => !group.starred && !iStarred.has(group.personId)).length;
  const starredMe = new Set(received.map((r) => r.user.id));
  const givenByPerson = new Map<string, StarRecord>();
  for (const record of given) if (!givenByPerson.has(record.personId)) givenByPerson.set(record.personId, record);
  const givenPeople = [...givenByPerson.values()];
  const notReturned = givenPeople.filter((record) => !starredMe.has(record.personId));
  const mutualGiven = givenPeople.filter((record) => starredMe.has(record.personId));
  // 收到但我还没回 Star：按人去重（同一人 Star 我多个仓库只列一次），保留最新一条记录
  const owedByMeMap = new Map<string, StarRecord>();
  for (const record of received) {
    if (!iStarred.has(record.user.id) && !owedByMeMap.has(record.user.id)) owedByMeMap.set(record.user.id, record);
  }
  const owedByMe = [...owedByMeMap.values()];
  // 对方名下的仓库数（与 /repos 按用户视图使用同一个归属规则）
  const repoCountByPerson = new Map<string, number>();
  for (const repo of all) {
    const personId = repoPersonId(repo);
    repoCountByPerson.set(personId, (repoCountByPerson.get(personId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">记录</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Stat label="已 Star 用户" value={givenPeople.length} />
          <Stat label="收到" value={received.length} />
          <Stat label="对方未回" value={notReturned.length} href="#not-returned" />
          <Stat label="我未回" value={owedByMe.length} href="#owed-by-me" />
          <Stat label="待 Star 用户" value={todo} href="/repos" />
          <Stat label="我的仓库" value={mine.length} href="/submit" />
        </div>
      </div>

      {syncError && <GitHubSyncWarning message={syncError.message} reauthorize={syncError.reauthorize} next="/history" />}

      <div id="owed-by-me" className="mt-8 scroll-mt-24">
        <Section
          title="我未回 Star"
          desc="对方已经 Star 了你的仓库，但你还没有 Star 对方的仓库。点「去回 Star」直达对方录入的仓库。"
          empty={received.length === 0 ? "还没有人 Star 过你的仓库。" : "收到的 Star 都已回礼，干得漂亮。"}
        >
          {owedByMe.map((record) => {
            const count = repoCountByPerson.get(record.user.id) ?? 0;
            return (
              <Row
                key={record.id}
                record={record}
                person={record.user}
                mutual={false}
                action={
                  count > 0 ? (
                    <Link
                      href={`/repos?view=users&user=${encodeURIComponent(record.user.id)}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg card-hover"
                    >
                      <Star className="size-3" /> 去回 Star
                      <span className="text-faint tabular-nums">{count}</span>
                    </Link>
                  ) : (
                    <span className="shrink-0 text-xs text-faint">对方未录入仓库</span>
                  )
                }
              />
            );
          })}
        </Section>
      </div>

      <div id="not-returned" className="mt-8 scroll-mt-24">
        <Section
          title="对方未 Star 我"
          desc="你已经 Star 了对方的仓库，但 GitHub 上还没有检测到对方 Star 你的仓库。"
          empty={given.length === 0 ? "你还没有 Star 过其他人的仓库。" : "当前没有未回 Star 记录。"}
        >
          {notReturned.map((record) => (
            <Row key={record.id} record={record} person={record.person} mutual={false} />
          ))}
        </Section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section
          title="已互 Star"
          desc="你 Star 过对方，对方也 Star 过你的仓库。"
          empty={
            <>
              尚无互 Star 记录。
              <Link href="/repos" className="ml-1 text-fg underline-offset-4 hover:underline">
                去浏览
              </Link>
            </>
          }
        >
          {mutualGiven.map((g) => (
            <Row
              key={g.id}
              record={g}
              person={g.person}
              mutual
            />
          ))}
        </Section>

        <Section
          title="收到的 Star"
          desc="你录入的仓库被谁 Star 了。标记「互」表示你也 Star 过对方。"
          empty={
            mine.length === 0 ? (
              <>
                尚未录入仓库。
                <Link href="/submit" className="ml-1 text-fg underline-offset-4 hover:underline">
                  去录入
                </Link>
              </>
            ) : (
              "尚无记录。"
            )
          }
        >
          {received.map((r) => (
            <Row key={r.id} record={r} person={r.user} mutual={iStarred.has(r.user.id)} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </>
  );
  const cls = "glass flex items-center gap-3 rounded-xl px-4 py-2";
  return href ? (
    <Link href={href} className={`${cls} card-hover`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Section({
  title,
  desc,
  empty,
  children,
}: {
  title: string;
  desc: string;
  empty: React.ReactNode;
  children: React.ReactNode[];
}) {
  return (
    <section className="panel-strong overflow-hidden rounded-3xl">
      <header className="border-b border-line px-6 py-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{desc}</p>
      </header>
      {children.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}

function Row({
  record,
  person,
  mutual,
  action,
}: {
  record: StarRecord;
  person: UserBrief;
  mutual: boolean;
  /** 行尾操作区（如"去回 Star"），可选 */
  action?: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-6">
      <Avatar src={person.avatarUrl} alt={person.login} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 max-w-full truncate text-sm font-medium" title={person.login}>{person.login}</span>
          <XhsBadge name={person.xhsName} />
          {mutual && (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted"
              title="互 Star"
            >
              <ArrowLeftRight className="size-3" /> 互
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
          <a
            href={record.repo.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 max-w-full items-center gap-1 font-mono text-xs text-muted hover:text-fg"
          >
            <Star className="size-3 shrink-0" />
            <span className="truncate">{record.repo.fullName}</span>
            <ArrowUpRight className="size-3 shrink-0" />
          </a>
          <LanguageBadge language={record.repo.language} />
        </div>
        {!record.repo.isAvailable && <p className="mt-1 text-xs text-muted">仓库暂不可访问 · 保留历史 Star 记录</p>}
      </div>
      {action}
      <time dateTime={record.createdAt} className="hidden shrink-0 text-xs tabular-nums text-faint sm:block" title={record.createdAt}>
        {timeAgo(record.createdAt)}
      </time>
    </li>
  );
}
