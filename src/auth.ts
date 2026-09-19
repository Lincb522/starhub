import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { claimReposByOwner, upsertUser } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      login: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    accessToken?: string;
    /** 当前 token 是否带 public_repo 权限（可一键 star）。老 token 需要重新登录授权 */
    canStar: boolean;
  }
}

export const GITHUB_SCOPE = "read:user user:email public_repo";

function scopeAllowsStar(scope: string | undefined): boolean {
  const set = new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
  return set.has("public_repo") || set.has("repo");
}

type GitHubProfile = {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string;
};

function adminLogins(): Set<string> {
  return new Set(
    (process.env.ADMIN_LOGINS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: GITHUB_SCOPE } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ profile }) {
      if (!profile) return false;
      const p = profile as unknown as GitHubProfile;
      const isAdmin = adminLogins().has(p.login.toLowerCase());
      // 没设置邀请口令时默认放行；管理员始终放行
      const autoApprove = !process.env.INVITE_CODE || isAdmin;

      upsertUser({
        id: String(p.id),
        login: p.login,
        name: p.name ?? null,
        avatarUrl: p.avatar_url ?? null,
        approved: autoApprove,
        isAdmin,
      });
      claimReposByOwner(String(p.id), p.login);
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as unknown as GitHubProfile;
        token.accessToken = account.access_token;
        token.scope = account.scope;
        token.uid = String(p.id);
        token.login = p.login;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.login = token.login as string;
      session.accessToken = token.accessToken as string | undefined;
      session.canStar = scopeAllowsStar(token.scope as string | undefined);
      return session;
    },
  },
});
