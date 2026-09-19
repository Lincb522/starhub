"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, KeyRound, Loader2, Star, Trash2 } from "lucide-react";
import { deleteRepo, starRepo, verifyStar } from "@/app/actions";

type Props = {
  repoId: number;
  htmlUrl: string;
  starred: boolean;
  isOwn: boolean;
  canDelete: boolean;
  loggedIn: boolean;
  canStar: boolean;
  isAvailable?: boolean;
  onStarred?: () => void;
};

export function StarButton({ repoId, htmlUrl, starred, isOwn, canDelete, loggedIn, canStar, isAvailable = true, onStarred }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (starred && confirmed) setConfirmed(false);
  const isStarred = starred || confirmed;

  const star = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await starRepo(repoId);
      if (!res.ok && res.code === "REAUTH") {
        router.push(`/login?reauth=1&next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setConfirmed(true);
        onStarred?.();
        router.refresh();
      }
    });
  };

  const sync = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await verifyStar(repoId);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setConfirmed(true);
        onStarred?.();
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!confirm("从本站删除这个仓库及相关记录？GitHub 仓库不受影响。")) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await deleteRepo(repoId);
        if (!res.ok) setMsg({ ok: false, text: res.message });
        else router.refresh();
      } catch {
        setMsg({ ok: false, text: "删除失败，请重试" });
      }
    });
  };

  const openLink = (
    <a
      href={htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="btn-ghost grid size-9 place-items-center rounded-lg text-fg/60 hover:text-fg"
      title="打开 GitHub"
    >
      <ExternalLink className="size-4" />
    </a>
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="btn-ghost inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm text-fg/60 hover:text-rose-300 disabled:opacity-50"
            aria-label="删除本站仓库"
            title="从本站删除仓库"
          >
            <Trash2 className="size-4" />
            删除
          </button>
        )}
        {!isAvailable ? null : isStarred ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-300">
              <Check className="size-4" strokeWidth={2.5} />
              已 Star
            </span>
            {openLink}
          </>
        ) : isOwn ? (
          <a
            href={htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fg/70"
          >
            我的仓库 <ExternalLink className="size-3.5" />
          </a>
        ) : !loggedIn ? (
          <a
            href={htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fg/70"
          >
            查看 <ExternalLink className="size-3.5" />
          </a>
        ) : !canStar ? (
          <>
            {openLink}
            <Link
              href="/login?reauth=1&next=/repos"
              className="btn-star inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold"
            >
              <KeyRound className="size-4" />
              授权并 Star
            </Link>
          </>
        ) : (
          <>
            {openLink}
            <button
              type="button"
              onClick={star}
              disabled={pending}
              className="btn-star inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4 fill-current" strokeWidth={2.5} />}
              {pending ? "Star 中" : "Star"}
            </button>
          </>
        )}
      </div>
      {isAvailable && loggedIn && !isOwn && !isStarred && canStar && !msg && (
        <button type="button" onClick={sync} disabled={pending} className="text-[11px] text-fg/35 hover:text-fg/70">
          已在 GitHub Star？同步记录
        </button>
      )}
      {msg && (!isStarred || !msg.ok) && (
        <p className={`max-w-[260px] text-right text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
      )}
    </div>
  );
}
