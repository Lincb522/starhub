import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "StarHub",
  description: "危楼高百尺，手可摘星辰",
};

// 首屏前读取主题，避免闪一下
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-theme="dark" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="atmosphere" aria-hidden>
          <div className="ambient ambient-coral" />
          <div className="ambient ambient-violet" />
          <div className="vignette" />
        </div>
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-8 text-[10px] font-semibold tracking-[0.08em] text-faint">
          <span>开发者 · 想自救</span>
          <span>NEXT.JS · AUTH.JS · SQLITE</span>
        </footer>
      </body>
    </html>
  );
}
