"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { joinWithCode, type ActionResult } from "@/app/actions";

export function JoinForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(joinWithCode, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/start"), 600);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input
        name="code"
        required
        autoFocus
        autoComplete="off"
        placeholder="口令"
        className="w-full rounded-xl border border-fg/10 bg-bg/60 px-4 py-3 text-center font-mono text-base tracking-widest placeholder:tracking-normal placeholder:text-fg/25"
      />
      <button type="submit" disabled={pending} className="btn-star inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
        {pending && <Loader2 className="size-4 animate-spin" />}
        加入
      </button>
      {state && <p className={`text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p>}
    </form>
  );
}
