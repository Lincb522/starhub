"use client";

export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  };
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="切换深浅色" title="切换深浅色" />;
}
