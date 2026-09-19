import { redirect } from "next/navigation";
import { getCurrentUser, inviteRequired } from "@/lib/current-user";
import { HistoryView } from "@/components/history-view";
import { syncGitHubStarTruth } from "@/lib/github-star-sync";
import { listUnreadReceivedStars } from "@/lib/db";
import { ReceivedStarAlert } from "@/components/received-star-alert";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/history");
  if (!user.approved && inviteRequired()) redirect("/join");
  const starSync = await syncGitHubStarTruth(user);
  const receivedAlert = listUnreadReceivedStars(user.id);
  return (
    <>
      <ReceivedStarAlert key={receivedAlert.ids.join(",")} {...receivedAlert} />
      <HistoryView
        user={{ id: user.id, login: user.login }}
        syncError={starSync.ok ? null : { message: starSync.message, reauthorize: starSync.code === "REAUTH" }}
      />
    </>
  );
}
