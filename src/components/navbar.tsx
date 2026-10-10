import Link from "next/link";
import { Star, LogOut } from "lucide-react";
import { signIn, signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";
import { Avatar } from "@/components/avatar";
import { LoginWithNotice } from "@/components/login-with-notice";
import { ThemeToggle } from "@/components/theme-toggle";
import { PromoLink } from "@/components/promo-link";

export async function Navbar() {
  const user = await getCurrentUser();

  const nav = user
    ? [
        { href: "/repos", label: "浏览" },
        { href: "/repos?view=grid", label: "全部仓库" },
        { href: "/history", label: "记录" },
        { href: "/submit", label: "录入" },
      ]
    : [{ href: "/repos", label: "全部仓库" }];

  return (
    <header className="sticky top-0 z-40 bg-bg/70 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="relative grid size-6 place-items-center">
            <Star className="size-5 text-fg" strokeWidth={2.2} />
            <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-coral ring-2 ring-bg" />
          </span>
          <span className="text-[11px] font-bold tracking-[0.32em] text-fg">STARHUB</span>
        </Link>

        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <PromoLink />
          <nav className="hidden items-center gap-3 text-xs font-semibold text-muted sm:flex">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href} className="transition hover:text-fg">
                {label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2 rounded-full border border-line bg-fg/[0.03] py-1 pl-1 pr-2">
              <Avatar src={user.avatarUrl} alt={user.login} size={24} />
              <span className="hidden max-w-36 truncate text-xs font-semibold text-muted sm:inline" title={user.login}>{user.login}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="grid size-6 place-items-center rounded-full text-faint transition hover:bg-fg/10 hover:text-fg"
                  title="退出登录"
                >
                  <LogOut className="size-3" />
                </button>
              </form>
            </div>
          ) : (
            <LoginWithNotice
              variant="nav"
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/start" });
              }}
            />
          )}
        </div>
      </div>
    </header>
  );
}
