"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  History,
  KeyRound,
  LayoutGrid,
  Loader2,
  PartyPopper,
  Plus,
  Star,
  Users,
} from "lucide-react";
import { starRepo } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { LanguageBadge } from "@/components/language-badge";
import { XhsBadge } from "@/components/xhs-badge";
import { StarDetails } from "@/components/star-details";
import { languageColor } from "@/lib/lang-colors";
import type { RepoWithStars } from "@/lib/db";
import type { PersonGroup } from "@/lib/repo-person";
import { repoPersonId } from "@/lib/repo-person";

type Props = {
  /** 当前用户尚未 Star 的人；每组仓库按已 Star 人数升序排列 */
  groups: PersonGroup<RepoWithStars>[];
  canStar: boolean;
  mineCount: number;
  doneCount: number;
  /** 给我的仓库点过 Star 的成员 id */
  starrersOfViewer: string[];
  embedded?: boolean;
};

type Leaving = "star" | "skip" | null;
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  threshold: number;
  axis: "pending" | "horizontal";
};
const LEAVE_MS = 280;
const MAX_DRAG = 180;

export function RepoDeck({ groups, canStar, mineCount, doneCount, starrersOfViewer, embedded = false }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState(() => groups.map((group) => group.personId));
  const [starredPeople, setStarredPeople] = useState<string[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [activeGroup, setActiveGroup] = useState<PersonGroup<RepoWithStars> | null>(null);
  const [activeRepo, setActiveRepo] = useState<RepoWithStars | null>(null);
  const [leaving, setLeaving] = useState<Leaving>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<DragState | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Keep only browsing order locally; refreshed props own repository eligibility and metadata.
  const queue = useMemo(() => {
    const completed = new Set(starredPeople);
    const available = new Map(groups.filter((group) => !completed.has(group.personId)).map((group) => [group.personId, group]));
    const result: PersonGroup<RepoWithStars>[] = [];
    for (const personId of order) {
      const group = available.get(personId);
      if (group) result.push(group);
      available.delete(personId);
    }
    return [...result, ...available.values()];
  }, [groups, order, starredPeople]);
  const starredNow = starredPeople.length;
  const totalStarred = doneCount + starredPeople.filter((id) => groups.some((group) => group.personId === id)).length;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Revalidation may remove the active card before its request or exit animation completes.
  const currentGroup = activeGroup ?? queue[0];
  const current = activeRepo ?? currentGroup?.repos.find((repo) => repo.id === selectedRepoId) ?? currentGroup?.repos[0];
  const busy = pending || activeRepo !== null;

  const resetDrag = useCallback(() => {
    drag.current = null;
    setDragging(false);
    setDragX(0);
  }, []);

  const skip = useCallback(() => {
    if (!current || !currentGroup || busy) return;
    resetDrag();
    setMsg(null);
    setActiveGroup(currentGroup);
    setActiveRepo(current);
    setLeaving("skip");
    timer.current = setTimeout(() => {
      setOrder([...queue.filter((group) => group.personId !== currentGroup.personId).map((group) => group.personId), currentGroup.personId]);
      setSelectedRepoId(null);
      setActiveGroup(null);
      setActiveRepo(null);
      setLeaving(null);
    }, LEAVE_MS);
  }, [current, currentGroup, busy, queue, resetDrag]);

  const star = useCallback(() => {
    if (!current || !currentGroup || busy) return;
    resetDrag();
    if (!canStar) {
      router.push(`/login?reauth=1&next=${encodeURIComponent(embedded ? "/" : "/repos")}`);
      return;
    }
    setMsg(null);
    setActiveGroup(currentGroup);
    setActiveRepo(current);
    startTransition(async () => {
      let res;
      try {
        res = await starRepo(current.id);
      } catch {
        setMsg("Star 失败，请重试");
        setActiveGroup(null);
        setActiveRepo(null);
        return;
      }
      if (!res.ok) {
        setActiveGroup(null);
        setActiveRepo(null);
        if (res.code === "REAUTH") router.push(`/login?reauth=1&next=${encodeURIComponent(embedded ? "/" : "/repos")}`);
        else setMsg(res.message);
        return;
      }
      setStarredPeople((ids) => ids.includes(currentGroup.personId) ? ids : [...ids, currentGroup.personId]);
      setLeaving("star");
      setToast(`已 Star ${current.fullName}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2200);
      timer.current = setTimeout(() => {
        setSelectedRepoId(null);
        setActiveGroup(null);
        setActiveRepo(null);
        setLeaving(null);
        router.refresh();
      }, LEAVE_MS);
    });
  }, [current, currentGroup, busy, canStar, router, resetDrag, embedded]);

  const finishDrag = useCallback(() => {
    const state = drag.current;
    const committed = state?.axis === "horizontal";
    drag.current = null;
    setDragging(false);

    if (!committed || !state) {
      setDragX(0);
      return;
    }
    if (state.currentX <= -state.threshold) star();
    else if (state.currentX >= state.threshold) skip();
    else setDragX(0);
  }, [skip, star]);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (busy || !current || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("a, button, details")) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: 0,
      threshold: Math.min(112, width * 0.26),
      axis: "pending",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || busy) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      state.axis = "horizontal";
      setDragging(true);
    }

    event.preventDefault();
    state.currentX = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
    setDragX(state.currentX);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    finishDrag();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "SUMMARY" ||
        tag === "A" ||
        (e.target as HTMLElement | null)?.isContentEditable ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      ) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowLeft" || e.key === "Enter" || e.key === " " || e.key.toLowerCase() === "s") {
        e.preventDefault();
        star();
      } else if (e.key.toLowerCase() === "o" && current) {
        window.open(current.htmlUrl, "_blank", "noopener,noreferrer");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, star, current]);

  if (!current) {
    return (
      <div className={`deck-stage ${embedded ? "deck-stage-embedded" : ""}`}>
        <div className="glass deck-enter flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl px-8 py-14 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-coral/10 text-coral">
            <PartyPopper className="size-8" />
          </span>
          <div>
            <h2 className="text-2xl font-semibold">{starredNow > 0 ? `本次 Star ${starredNow} 位用户` : "暂无待 Star 的用户"}</h2>
            <p className="mt-2 text-sm text-fg/55">
              累计 Star {totalStarred} 位用户。
              {mineCount === 0 ? "尚未录入自己的仓库。" : "新加入的用户会显示在这里。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/submit" className="btn-star inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold">
              <Plus className="size-4" strokeWidth={2.5} /> 录入仓库
            </Link>
            <Link href="/history" className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm">
              <History className="size-4" /> 记录
            </Link>
            <Link href="/repos?view=grid" className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm">
              <LayoutGrid className="size-4" /> 全部仓库
            </Link>
          </div>
        </div>
        <Toast text={toast} />
      </div>
    );
  }

  const r = current;
  const accent = languageColor(r.language ?? "");
  const ownerStarredViewer = starrersOfViewer.includes(repoPersonId(r));
  const leaveClass = leaving === "star" ? "deck-leave-star" : leaving === "skip" ? "deck-leave-skip" : "deck-enter";
  const dragProgress = Math.min(1, Math.abs(dragX) / 96);
  const dragStyle = leaving
    ? undefined
    : {
        transform: `translate3d(${dragX}px, 0, 0) rotate(${dragX / 28}deg)`,
        transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      };

  return (
    <div className={`deck-stage ${embedded ? "deck-stage-embedded" : ""}`}>
      <div className="mb-5 flex w-full max-w-2xl items-center justify-between text-xs text-fg/45">
        <span className="tabular-nums">
          待 Star 用户 <span className="text-fg/80">{queue.length}</span>
          {starredNow > 0 && (
            <>
              {" "}
              · 本次 <span className="text-coral">{starredNow}</span>
            </>
          )}
        </span>
        <span className="hidden items-center gap-3 sm:flex">
          <Key>←</Key> Star
          <Key>→</Key> 下一张
          <Key>O</Key> 打开 GitHub
        </span>
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
          <span
            className="absolute left-5 top-1/2 -translate-y-1/2 rounded-full border border-fg/10 bg-fg/8 px-3 py-1.5 text-sm font-bold text-fg/70"
            style={{ opacity: dragX > 0 ? dragProgress : 0 }}
          >
            下一张 →
          </span>
          <span
            className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full border border-coral/20 bg-coral/15 px-3 py-1.5 text-sm font-bold text-coral"
            style={{ opacity: dragX < 0 ? dragProgress : 0 }}
          >
            ← Star
          </span>
        </div>
        {queue.length > 2 && (
          <div className="pointer-events-none absolute inset-x-6 -bottom-3 h-full rounded-3xl border border-fg/5 bg-fg/[0.02]" />
        )}
        {queue.length > 1 && (
          <div className="pointer-events-none absolute inset-x-3 -bottom-1.5 h-full rounded-3xl border border-fg/8 bg-fg/[0.03]" />
        )}

        <article
          key={currentGroup.personId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={resetDrag}
          onDragStart={(event) => event.preventDefault()}
          style={dragStyle}
          className={`deck-card panel-strong relative overflow-hidden rounded-3xl p-5 sm:p-10 ${leaveClass} ${dragging ? "is-dragging" : ""}`}
        >
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl" style={{ background: `${accent}2e` }} />

          <div className="relative flex items-center gap-4">
            <Avatar src={r.person.avatarUrl} alt={r.person.login} size={56} className="shrink-0 ring-2 ring-fg/10" />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-fg/55">
                <span className="min-w-0 max-w-full truncate" title={`@${r.person.login}`}>@{r.person.login}</span>
                <XhsBadge name={r.person.xhsName} />
              </p>
              <a
                href={r.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate text-2xl font-bold tracking-tight hover:text-coral sm:text-3xl"
                title={r.fullName}
              >
                <span className="text-fg/40">{r.owner}/</span>
                {r.name}
              </a>
            </div>
          </div>

          <p className="relative mt-6 min-h-14 text-pretty text-base leading-relaxed text-fg/70 sm:text-lg">
            {r.description || "暂无简介"}
          </p>

          {currentGroup.repos.length > 1 && (
            <details className="relative mt-5 rounded-xl border border-line bg-fg/[0.03]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-fg/75">
                选择项目 · 共 {currentGroup.repos.length} 个
                <ChevronDown className="size-4 shrink-0" />
              </summary>
              <div className="border-t border-line p-2">
                <p className="px-2 pb-1 text-xs text-fg/45">选好项目后点下方 Star</p>
                {currentGroup.repos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    aria-pressed={r.id === repo.id}
                    disabled={busy}
                    onClick={() => { setSelectedRepoId(repo.id); setMsg(null); }}
                    className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-fg/5 ${r.id === repo.id ? "text-coral" : "text-fg/70"}`}
                  >
                    <span className="truncate">{repo.fullName}</span>
                    {r.id === repo.id && <Check className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </details>
          )}

          <div className="relative mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg/55">
            <LanguageBadge language={r.language} />
            <span className="flex items-center gap-1.5" title="GitHub Star 数">
              <Star className="size-4" />
              {r.stargazers.toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5 text-coral" title="已 Star 人数">
              <Users className="size-4" />
              {r.stars.length} 人已 Star
            </span>
            {ownerStarredViewer && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-fg/5 px-2 py-1 text-xs font-medium text-fg/75"
                title={`${r.owner} 已 Star 过你的仓库`}
              >
                <ArrowLeftRight className="size-3.5 text-coral" /> 对方已 Star 你
              </span>
            )}
            <StarDetails
              repoFullName={r.fullName}
              repoUrl={r.htmlUrl}
              stars={r.stars}
              previewLimit={5}
              previewSize={24}
            />
            <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-fg/45 hover:text-fg">
              打开 GitHub <ExternalLink className="size-3.5" />
            </a>
          </div>

          <div className="relative mt-10 flex items-center gap-3">
            <button
              type="button"
              onClick={star}
              disabled={busy}
              className="btn-star inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-semibold"
            >
              {pending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : canStar ? (
                <Star className="size-5 fill-current" strokeWidth={2.5} />
              ) : (
                <KeyRound className="size-5" />
              )}
              {pending ? "Star 中…" : canStar ? "Star" : "授权并 Star"}
            </button>
            <button
              type="button"
              onClick={skip}
              disabled={busy}
              className="btn-ghost inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-sm text-fg/70 hover:text-fg disabled:opacity-50"
            >
              下一张 <ArrowRight className="size-4" />
            </button>
          </div>

          {msg && <p className="relative mt-3 text-center text-xs text-rose-300">{msg}</p>}
        </article>
      </div>

      <p className="mt-6 flex items-center gap-4 text-xs text-fg/30 sm:mt-8">
        <span className="sm:hidden">← 左滑 Star · 右滑下一张 →</span>
        <Link href="/history" className="inline-flex items-center gap-1 hover:text-fg">
          <History className="size-3" /> 记录
        </Link>
      </p>
      <Toast text={toast} />
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-fg/10 bg-fg/5 px-1.5 py-0.5 font-mono text-[10px] text-fg/60">{children}</kbd>;
}

function Toast({ text }: { text: string | null }) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center transition-all duration-300 ${
        text ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      {text && (
        <span className="panel-strong inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
          <span className="grid size-5 place-items-center rounded-full bg-coral text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
          {text}
        </span>
      )}
    </div>
  );
}
