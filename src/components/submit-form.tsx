"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AtSign, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import { RepoPicker } from "@/components/repo-picker";
import { submitRepo, type ActionResult } from "@/app/actions";

export function SubmitForm({
  defaultOwner,
  defaultXhs,
  onboarding = false,
}: {
  defaultOwner: string;
  defaultXhs: string;
  onboarding?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(submitRepo, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // 每次录入成功 +1，通知仓库选择器刷新“已录入”标记
  const [okCount, setOkCount] = useState(0);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setOkCount((n) => n + 1);
  }

  useEffect(() => {
    if (state?.ok) {
      // 只清空仓库输入，小红书账号保留
      const repoInput = formRef.current?.elements.namedItem("repo") as HTMLInputElement | null;
      if (repoInput) repoInput.value = "";
      router.refresh();
    }
  }, [state, router]);

  const pick = (fullName: string) => {
    const form = formRef.current;
    if (!form) return;
    const repoInput = form.elements.namedItem("repo") as HTMLInputElement | null;
    if (repoInput) repoInput.value = fullName;
    const xhsInput = form.elements.namedItem("xhs") as HTMLInputElement | null;
    if (xhsInput && !xhsInput.value.trim()) {
      xhsInput.focus();
      xhsInput.reportValidity();
      return;
    }
    form.requestSubmit();
  };

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      <RepoPicker onPick={pick} disabled={pending} defaultOpen={onboarding} reloadKey={okCount} />

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg/80">或手动填写仓库地址</span>
        <div className="relative">
          <GithubIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg/40" />
          <input
            name="repo"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder={`https://github.com/${defaultOwner}/awesome-project`}
            className="w-full rounded-xl border border-fg/10 bg-bg/60 py-3 pl-10 pr-4 font-mono text-sm placeholder:text-fg/25"
          />
        </div>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-fg/80">
          小红书账号
          <span className="rounded-[3px] bg-rose-500 px-1 py-px text-[9px] font-bold leading-none text-fg">红</span>
        </span>
        <div className="relative">
          <AtSign className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg/40" />
          <input
            name="xhs"
            required
            maxLength={40}
            autoComplete="off"
            defaultValue={defaultXhs}
            placeholder="小红书昵称或小红书号"
            className="w-full rounded-xl border border-fg/10 bg-bg/60 py-3 pl-10 pr-4 text-sm placeholder:text-fg/25"
          />
        </div>
        <span className="text-xs text-fg/40">显示在你的仓库卡片上，可随时修改。</span>
      </label>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg/40">仅支持公开仓库。</p>
        <button
          type="submit"
          disabled={pending}
          className="btn-star inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "获取中…" : "录入"}
        </button>
      </div>

      {state && (
        <div
          className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm ${
            state.ok
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-rose-400/25 bg-rose-400/10 text-rose-200"
          }`}
        >
          <div className="flex items-start gap-2">
            {state.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span>{state.message}</span>
          </div>
          {state.ok && onboarding && (
            <Link
              href="/repos"
              className="btn-star inline-flex items-center justify-center gap-2 self-start rounded-lg px-4 py-2 text-sm font-semibold"
            >
              开始 Star <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}
    </form>
  );
}
