import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { JoinForm } from "@/components/join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/join");
  if (user.approved) redirect("/repos");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="grid size-16 place-items-center rounded-2xl glass text-fg">
        <KeyRound className="size-7" />
      </span>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">口令</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg/55">输入口令以加入。</p>
      <div className="glass mt-8 w-full rounded-2xl p-6">
        <JoinForm />
      </div>
    </div>
  );
}
