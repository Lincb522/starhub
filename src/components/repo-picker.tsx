"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, GitFork, Loader2, RefreshCw, Search, Star } from "lucide-react";
import { fetchMyRepos, type MyRepo } from "@/app/actions";
import { LanguageBadge } from "@/components/language-badge";

type Props = {
  /** 点击某个仓库时回调（通常是填入输入框并提交） */
  onPick: (fullName: string) => void;
  /** 外部正在提交，禁用列表点击 */
  disabled?: boolean;
  /** 默认展开 */
  defaultOpen?: boolean;
  /** 变化时重新拉取（比如录入成功后刷新“已录入”标记） */
  reloadKey?: number;
};

export function RepoPicker({ onPick, disabled = false, defaultOpen = false, reloadKey = 0 }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [repos, setRepos] = useState<MyRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showForks, setShowForks] = useState(false);

  // reloadKey 变化（录入成功）→ 清空列表，触发下面的重新加载
  const [seenKey, setSeenKey] = useState(reloadKey);
  if (reloadKey !== seenKey) {
    setSeenKey(reloadKey);
    setRepos(null);
    setError(null);
  }

  const loading = open && repos === null && error === null;

  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    fetchMyRepos().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === "REAUTH") router.push("/login?reauth=1&next=/submit");
        else setError(res.message);
        return;
      }
      setRepos(res.repos);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, router]);

  const reload = () => {
    setRepos(null);
    setError(null);
  };

  const list = useMemo(() => {
    if (!repos) return [];
    const kw = q.trim().toLowerCase();
    return repos.filter((r) => {
      if (!showForks && r.fork) return false;
      if (!kw) return true;
      return r.name.toLowerCase().includes(kw) || (r.description ?? "").toLowerCase().includes(kw) || (r.language ?? "").toLowerCase().includes(kw);
    });
  }, [repos, q, showForks]);

  const forkCount = repos?.filter((r) => r.fork).length ?? 0;

  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-fg/85 hover:text-fg"
      >
        <span>从我的 GitHub 仓库选择</span>
        <ChevronDown className={`size-4 text-faint transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-line">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="筛选仓库名 / 简介 / 语言"
                className="w-full rounded-lg border border-line bg-bg/60 py-1.5 pl-8 pr-3 text-xs placeholder:text-faint"
              />
            </div>
            {forkCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={showForks} onChange={(e) => setShowForks(e.target.checked)} className="accent-coral" />
                含 fork ({forkCount})
              </label>
            )}
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="grid size-7 place-items-center rounded-lg text-faint hover:bg-fg/5 hover:text-fg"
              title="刷新"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto border-t border-line">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" /> 正在读取 GitHub 仓库…
              </p>
            ) : error ? (
              <p className="py-10 text-center text-xs text-rose-300">{error}</p>
            ) : list.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted">{repos && repos.length > 0 ? "无匹配仓库" : "账号下没有公开仓库"}</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((r) => (
                  <li key={r.fullName}>
                    <button
                      type="button"
                      disabled={disabled || r.submitted}
                      onClick={() => onPick(r.fullName)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-fg/[0.04] disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            className={`min-w-0 max-w-full truncate text-sm font-medium ${r.submitted ? "text-faint" : "text-fg"}`}
                            title={r.name}
                          >
                            {r.name}
                          </span>
                          {r.fork && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-faint">
                              <GitFork className="size-3" /> fork
                            </span>
                          )}
                          {r.archived && <span className="text-[10px] text-faint">archived</span>}
                        </div>
                        {r.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{r.description}</p>}
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-faint">
                          <LanguageBadge language={r.language} className="max-w-32" />
                          <span className="flex items-center gap-1">
                            <Star className="size-3" />
                            {r.stargazers.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 pt-0.5 text-xs">
                        {r.submitted ? (
                          <span className="inline-flex items-center gap-1 text-faint">
                            <Check className="size-3.5" /> 已录入
                          </span>
                        ) : (
                          <span className="rounded-md border border-line px-2 py-0.5 font-medium text-muted">录入</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
