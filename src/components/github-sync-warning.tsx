import Link from "next/link";

export function GitHubSyncWarning({
  message,
  reauthorize = false,
  next = "/repos",
}: {
  message: string;
  reauthorize?: boolean;
  next?: string;
}) {
  return (
    <div role="status" className="mt-6 flex flex-col gap-3 rounded-xl border border-coral/20 bg-coral/10 px-4 py-3 text-sm text-fg/75 sm:flex-row sm:items-center sm:justify-between">
      <p>
        GitHub Star 状态同步失败：{message}。当前显示上次成功结果。
      </p>
      {reauthorize ? (
        <Link
          href={`/login?reauth=1&next=${encodeURIComponent(next)}`}
          className="btn-star inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg px-3 font-semibold"
        >
          重新授权
        </Link>
      ) : (
        <span className="shrink-0 text-xs text-muted">请稍后刷新重试</span>
      )}
    </div>
  );
}
