"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Star, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { RepoWithStars } from "@/lib/db";
import { timeAgo } from "@/lib/time";

type StarEntry = RepoWithStars["stars"][number];

export function StarDetails({
  repoFullName,
  repoUrl,
  stars,
  previewLimit = 6,
  previewSize = 22,
}: {
  repoFullName: string;
  repoUrl: string;
  stars: StarEntry[];
  previewLimit?: number;
  previewSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `${useId()}-star-details-title`;
  const preview = stars.slice(0, previewLimit);

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  if (stars.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`查看给 ${repoFullName} Star 的 ${stars.length} 位用户`}
        title="查看 Star 详情"
        onClick={() => setOpen(true)}
        className="group flex min-h-11 shrink-0 items-center rounded-full px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
      >
        <span className="flex -space-x-2">
          {preview.map((entry) => (
            <Avatar
              key={entry.user.id}
              src={entry.user.avatarUrl}
              alt={entry.user.login}
              size={previewSize}
              className="ring-2 ring-bg transition group-hover:ring-coral/60"
            />
          ))}
          {stars.length > preview.length && (
            <span
              className="grid place-items-center rounded-full bg-fg/10 text-[10px] font-semibold ring-2 ring-bg transition group-hover:ring-coral/60"
              style={{ width: previewSize, height: previewSize }}
            >
              +{stars.length - preview.length}
            </span>
          )}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="star-details-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-[4px] backdrop-saturate-[.88]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="star-details-panel flex max-h-[min(80vh,42rem)] w-full max-w-[30rem] flex-col overflow-hidden rounded-2xl text-fg outline-none backdrop-blur-[30px] backdrop-saturate-[1.32]"
            >
              <header className="flex min-w-0 items-start gap-3 bg-fg/[0.025] px-5 pb-4 pt-5">
                <span
                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-coral/12 text-coral ring-1 ring-coral/15"
                  aria-hidden
                >
                  <Star className="size-4 fill-current" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em]">
                    谁点过 Star
                  </h2>
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                    title={repoFullName}
                  >
                    <span className="truncate">{repoFullName}</span>
                    <ArrowUpRight className="size-3 shrink-0" />
                  </a>
                  <p className="mt-2.5 flex items-center gap-2 whitespace-nowrap text-xs text-muted">
                    <span className="size-1.5 rounded-full bg-coral ring-4 ring-coral/10" />
                    <span>
                      <strong className="font-semibold tabular-nums text-fg">{stars.length}</strong> 位用户
                    </span>
                    <span className="text-faint" aria-hidden>·</span>
                    <span>最近优先</span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭 Star 详情"
                  onClick={() => setOpen(false)}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.07] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral active:bg-fg/10"
                >
                  <X className="size-4" />
                </button>
              </header>

              <ul className="min-h-0 overflow-y-auto px-3 py-3">
                {stars.map((entry) => (
                  <li key={entry.user.id}>
                    <a
                      href={`https://github.com/${encodeURIComponent(entry.user.login)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex min-h-[62px] min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-fg/[0.045] focus-visible:bg-fg/[0.045] focus-visible:outline-2 focus-visible:outline-coral active:bg-fg/[0.07]"
                    >
                      <Avatar
                        src={entry.user.avatarUrl}
                        alt={entry.user.login}
                        size={42}
                        className="ring-2 ring-fg/[0.07] transition-transform duration-200 group-hover:scale-[1.035]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1 text-sm font-semibold tracking-[-0.01em]">
                          <span className="truncate" title={entry.user.login}>
                            @{entry.user.login}
                          </span>
                          <ArrowUpRight className="size-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                        </p>
                        {entry.user.xhsName && (
                          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
                            <span className="shrink-0 font-medium text-coral">小红书</span>
                            <span className="truncate">{entry.user.xhsName}</span>
                          </p>
                        )}
                      </div>
                      <time
                        dateTime={entry.createdAt}
                        title={entry.createdAt}
                        className="shrink-0 text-[11px] tabular-nums text-muted"
                      >
                        {timeAgo(entry.createdAt)}
                      </time>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
