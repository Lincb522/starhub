"use client";

import { useId, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { GithubIcon } from "@/components/icons";

type LoginVariant = "hero" | "page" | "nav";

const variantStyles: Record<
  LoginVariant,
  { form: string; button: string; icon: string }
> = {
  hero: {
    form: "flex-1",
    button: "btn-star flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap px-5 text-sm font-semibold",
    icon: "size-4",
  },
  page: {
    form: "mt-8 w-full",
    button: "btn-star flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-3.5 text-base font-semibold",
    icon: "size-5",
  },
  nav: {
    form: "shrink-0",
    button: "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-muted transition hover:text-fg sm:min-h-0",
    icon: "size-3.5",
  },
};

export function LoginWithNotice({
  action,
  label = "GitHub 登录",
  variant = "hero",
  reauthorize = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
  variant?: LoginVariant;
  reauthorize?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${useId()}-title`;
  const descriptionId = `${useId()}-description`;
  const styles = variantStyles[variant];

  return (
    <form className={styles.form} action={action}>
      <button type="button" className={styles.button} onClick={() => dialogRef.current?.showModal()}>
        <GithubIcon className={styles.icon} />
        {label}
        {variant === "nav" && <span aria-hidden>↗</span>}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed inset-0 m-auto w-[min(calc(100%-2rem),26rem)] rounded-2xl border border-line-strong bg-bg p-0 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
        onCancel={(event) => {
          event.preventDefault();
          event.currentTarget.close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="p-6 sm:p-7">
          <span className="grid size-11 place-items-center rounded-xl bg-coral/12 text-coral" aria-hidden>
            <ShieldAlert className="size-5" strokeWidth={1.8} />
          </span>

          <h2 id={titleId} className="mt-5 text-xl font-semibold tracking-tight">
            Star 操作请放慢一点
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
            短时间内连续 Star 太多仓库，可能触发 GitHub 限制。请按兴趣逐个查看、分散操作；如果出现失败提示，请暂停一会儿再继续。
          </p>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              autoFocus
              className="btn-ghost min-h-11 rounded-xl px-4 text-sm font-semibold"
              onClick={() => dialogRef.current?.close()}
            >
              暂不登录
            </button>
            <button type="submit" className="btn-star min-h-11 rounded-xl px-4 text-sm font-semibold">
              {reauthorize ? "知道了，继续授权" : "知道了，继续登录"}
            </button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
