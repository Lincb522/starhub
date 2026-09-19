import { cache } from "react";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = getUserById(session.user.id);
  if (!user) return null;
  return { ...user, accessToken: session.accessToken, canStar: session.canStar };
});

export const inviteRequired = () => Boolean(process.env.INVITE_CODE);
