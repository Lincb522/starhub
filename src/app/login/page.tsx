import { redirect } from "next/navigation";
import { KeyRound, Star } from "lucide-react";
import { auth, signIn } from "@/auth";
import { LoginWithNotice } from "@/components/login-with-notice";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/start";
  const reauth = sp.reauth === "1";
  if (session?.user && !reauth) redirect(next);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="grid size-16 place-items-center rounded-2xl glass text-fg">
        {reauth ? <KeyRound className="size-8" /> : <Star className="size-8 fill-current" />}
      </span>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">{reauth ? "重新授权" : "登录"}</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg/55">
        {reauth
          ? "Star 操作需要 GitHub public_repo 权限，当前登录未包含该权限。重新登录即可。"
          : "登录后可录入仓库，并为其他仓库 Star。Star 仅在点击时执行，每次一个仓库，不访问私有仓库。"}
      </p>
      <LoginWithNotice
        variant="page"
        reauthorize={reauth}
        label={reauth ? "GitHub 重新授权" : "GitHub 登录"}
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: next });
        }}
      />
      <p className="mt-4 text-xs text-fg/35">
        所需权限：<code className="font-mono">read:user</code> · <code className="font-mono">user:email</code> ·{" "}
        <code className="font-mono">public_repo</code>（Star 操作所需的最小权限）
      </p>
      {typeof sp.error === "string" && <p className="mt-4 text-sm text-rose-300">登录失败：{sp.error}</p>}
    </div>
  );
}
