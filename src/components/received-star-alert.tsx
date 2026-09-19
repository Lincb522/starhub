"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, BellRing, Loader2, Star } from "lucide-react";
import { acknowledgeReceivedStars } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import type { ReceivedStarNotification } from "@/lib/db";

export function ReceivedStarAlert({
  total,
  ids,
  items,
}: {
  total: number;
  ids: number[];
  items: ReceivedStarNotification[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(total > 0 && ids.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (visible && dialog && !dialog.open) dialog.showModal();
  }, [visible]);

  if (!visible || items.length === 0) return null;

  const acknowledge = (showHistory: boolean) => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await acknowledgeReceivedStars(ids);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      dialogRef.current?.close();
      setVisible(false);
      if (showHistory) router.push("/history");
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="received-star-title"
      onCancel={(event) => {
        event.preventDefault();
        acknowledge(false);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line-strong bg-bg p-0 text-fg backdrop:bg-black/75"
    >
      <div className="border-t-4 border-coral px-5 pb-5 pt-6 sm:px-6 sm:pb-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-coral text-white">
            <BellRing className="size-5" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-coral">Star 提醒</p>
            <h2 id="received-star-title" className="mt-1 text-xl font-bold tracking-tight">
              你收到了 {total} 个新 Star
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">看看是谁给你的仓库点了 Star。</p>
          </div>
        </div>

        <ul className="mt-5 divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-start gap-3 py-3">
              <Avatar src={item.user.avatarUrl} alt={item.user.login} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" title={item.user.login}>
                  {item.user.login}
                </p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
                  <Star className="size-3 shrink-0 fill-coral text-coral" />
                  <span className="shrink-0">已 Star</span>
                  <span className="truncate font-mono" title={item.repo.fullName}>
                    {item.repo.fullName}
                  </span>
                </p>
                {item.starrerRepos.length > 0 && (
                  <div className="mt-1.5 rounded-lg bg-fg/[0.04] px-2.5 py-1.5">
                    <p className="flex items-center gap-1 text-[11px] font-medium text-fg/60">
                      <ArrowLeftRight className="size-3 shrink-0 text-coral" />
                      TA 的仓库 · 回个 Star
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {item.starrerRepos.slice(0, 3).map((repo) => (
                        <li key={repo.fullName} className="min-w-0">
                          <a
                            href={repo.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-mono text-xs text-fg/75 hover:text-coral"
                            title={repo.fullName}
                          >
                            {repo.fullName}
                          </a>
                        </li>
                      ))}
                    </ul>
                    {item.starrerRepos.length > 3 && (
                      <p className="mt-0.5 text-[11px] text-faint">
                        还有 {item.starrerRepos.length - 3} 个仓库
                      </p>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {total > items.length && <p className="mt-2 text-xs text-faint">还有 {total - items.length} 条，可在记录中查看。</p>}

        {error && <p role="alert" className="mt-3 text-sm text-coral">{error}</p>}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => acknowledge(true)}
            disabled={pending}
            className="btn-star inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            查看记录
          </button>
          <button
            type="button"
            onClick={() => acknowledge(false)}
            disabled={pending}
            className="btn-ghost min-h-11 rounded-xl px-4 text-sm font-semibold"
          >
            知道了
          </button>
        </div>
      </div>
    </dialog>
  );
}
