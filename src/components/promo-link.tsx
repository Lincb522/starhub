"use client";

import { useEffect, useState } from "react";
import { Gift, PartyPopper } from "lucide-react";

const COUPON = "starhub";
const TARGET_URL = "https://wzyp.cn/shop/RYFLI40K";

export function PromoLink() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(COUPON);
    } catch {
      // fallback: try execCommand
      const ta = document.createElement("textarea");
      ta.value = COUPON;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.open(TARGET_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-coral transition hover:bg-coral/10"
      title="点击复制优惠券 starhub 并跳转"
    >
      <PartyPopper className="size-3.5" />
      <span>低价star</span>
      <span className="rounded bg-coral/10 px-1.5 py-0.5 font-mono text-[11px]">
        {copied ? "✓ 已复制" : COUPON}
      </span>
      <Gift className="size-3.5" />
    </button>
  );
}