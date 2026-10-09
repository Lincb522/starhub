"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, PartyPopper } from "lucide-react";

const COUPON = "starhub";
const TARGET_URL = "https://wzyp.cn/shop/RYFLI40K";

type CopyStatus = "idle" | "copied" | "error";

export function PromoLink() {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const attempt = useRef(0);

  useEffect(() => () => { attempt.current += 1; }, []);

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copyCoupon() {
    const currentAttempt = ++attempt.current;
    try {
      await navigator.clipboard.writeText(COUPON);
      if (currentAttempt === attempt.current) setStatus("copied");
    } catch {
      if (currentAttempt === attempt.current) setStatus("error");
    }
  }

  const message = status === "copied"
    ? "优惠码 starhub 已复制"
    : status === "error" ? "复制失败，请手动输入优惠码 starhub" : "";

  return (
    <a
      href={TARGET_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={copyCoupon}
      className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/20 bg-black px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg lg:inline-flex"
      title={message || "点击复制优惠券 starhub，并在新标签页打开"}
    >
      <PartyPopper className="size-3.5 shrink-0" aria-hidden="true" />
      <span>低价star</span>
      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">
        {status === "copied" ? "✓ 已复制" : status === "error" ? "请用 starhub" : COUPON}
      </span>
      <Gift className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only" role="status" aria-live="polite">{message}</span>
    </a>
  );
}
