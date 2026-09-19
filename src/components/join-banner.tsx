import Link from "next/link";
import { KeyRound } from "lucide-react";

export function JoinBanner() {
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-coral/25 bg-coral/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-coral/10 text-coral">
          <KeyRound className="size-4" />
        </span>
        <div>
          <p className="font-medium text-coral">需要口令</p>
          <p className="mt-0.5 text-sm text-coral">录入仓库与 Star 操作需先验证口令。</p>
        </div>
      </div>
      <Link href="/join" className="btn-star self-start rounded-lg px-4 py-2 text-sm font-semibold sm:self-auto">
        输入口令
      </Link>
    </div>
  );
}
