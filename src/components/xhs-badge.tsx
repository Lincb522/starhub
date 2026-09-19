export function XhsBadge({ name, className = "" }: { name: string | null | undefined; className?: string }) {
  if (!name) return null;
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-coral/25 bg-coral/10 px-1.5 py-0.5 text-[11px] font-semibold text-coral ${className}`}
      title="小红书账号"
    >
      <span className="grid size-3.5 shrink-0 place-items-center rounded-[3px] bg-coral text-[8px] font-bold leading-none text-white">红</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
