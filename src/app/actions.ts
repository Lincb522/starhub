"use server";

import { revalidatePath } from "next/cache";
import * as db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  NeedReauthError,
  fetchRepo,
  hasStarred,
  listOwnRepos,
  parseRepoInput,
  starRepo as githubStar,
  type OwnRepo,
} from "@/lib/github";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: "REAUTH" };

const XHS_MAX = 40;

function normalizeXhs(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/^@/, "");
  return s ? s.slice(0, XHS_MAX) : null;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/repos");
  revalidatePath("/history");
  revalidatePath("/submit");
  revalidatePath("/start");
}

async function requireMember() {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录 GitHub" as const, user: null };
  if (!user.approved) return { error: "请先验证口令" as const, user: null };
  return { error: null, user };
}

export async function submitRepo(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { error, user } = await requireMember();
  if (error) return { ok: false, message: error };

  const raw = String(formData.get("repo") ?? "");
  const parsed = parseRepoInput(raw);
  if (!parsed) return { ok: false, message: "格式无效，请输入 owner/repo 或 GitHub 仓库链接" };

  const xhs = normalizeXhs(formData.get("xhs"));
  if (!xhs) return { ok: false, message: "请填写小红书账号" };
  if (xhs !== user.xhsName) db.setXhsName(user.id, xhs);

  let gh;
  try {
    gh = await fetchRepo(parsed.owner, parsed.name, user.accessToken);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!gh) return { ok: false, message: "GitHub 上不存在该仓库，或该仓库为私有" };

  if (db.getRepoByGitHubId(gh.githubId) || db.getRepoByFullName(gh.fullName)) {
    return { ok: false, message: `${gh.fullName} 已录入` };
  }

  db.createRepo({
    githubId: gh.githubId,
    fullName: gh.fullName,
    owner: gh.owner,
    name: gh.name,
    description: gh.description,
    language: gh.language,
    stargazers: gh.stargazers,
    htmlUrl: gh.htmlUrl,
    submitterId: user.id,
  });

  revalidateAll();
  return { ok: true, message: `已录入 ${gh.fullName}` };
}

export type MyRepo = OwnRepo & { submitted: boolean };

/** 当前用户 GitHub 账号下的公开仓库，并标记哪些已录入 */
export async function fetchMyRepos(): Promise<{ ok: true; repos: MyRepo[] } | { ok: false; message: string; code?: "REAUTH" }> {
  const { error, user } = await requireMember();
  if (error) return { ok: false, message: error };
  if (!user.accessToken) return { ok: false, message: "登录已过期，请重新登录", code: "REAUTH" };

  let repos: OwnRepo[];
  try {
    repos = await listOwnRepos(user.accessToken);
  } catch (e) {
    if (e instanceof NeedReauthError) return { ok: false, message: e.message, code: "REAUTH" };
    return { ok: false, message: (e as Error).message };
  }

  const submitted = new Set(db.listRepos({ includeUnavailable: true }).map((r) => r.fullName.toLowerCase()));
  return { ok: true, repos: repos.map((r) => ({ ...r, submitted: submitted.has(r.fullName.toLowerCase()) })) };
}

async function refreshRepoMeta(repo: db.Repo, token: string) {
  try {
    const gh = await fetchRepo(repo.owner, repo.name, token);
    if (gh) db.updateRepoMeta(repo.id, gh);
  } catch {
    /* 非关键路径 */
  }
}

/**
 * 一键 star：用当前用户自己的授权，对「这一个」仓库发起 star。
 * 每次调用只处理一个仓库，且必须由用户点击触发。
 */
export async function starRepo(repoId: number): Promise<ActionResult> {
  const { error, user } = await requireMember();
  if (error) return { ok: false, message: error };
  if (!user.accessToken) return { ok: false, message: "登录已过期，请重新登录", code: "REAUTH" };
  if (!user.canStar) return { ok: false, message: "需要重新授权 Star 权限", code: "REAUTH" };

  const repo = db.getRepoById(repoId);
  if (!repo) return { ok: false, message: "仓库不存在" };
  if (!repo.isAvailable) return { ok: false, message: "仓库暂不可访问，已暂停 Star" };
  if (repo.owner.toLowerCase() === user.login.toLowerCase()) {
    return { ok: false, message: "不能 Star 自己的仓库" };
  }
  try {
    await githubStar(user.accessToken, repo.owner, repo.name);
  } catch (e) {
    if (e instanceof NeedReauthError) return { ok: false, message: e.message, code: "REAUTH" };
    return { ok: false, message: (e as Error).message };
  }

  db.upsertStar(user.id, repoId);
  await refreshRepoMeta(repo, user.accessToken);
  revalidateAll();
  return { ok: true, message: "已 Star" };
}

/**
 * 兜底：用户已经在 GitHub 网页上手动点过，这里只做校验登记。
 */
export async function verifyStar(repoId: number): Promise<ActionResult> {
  const { error, user } = await requireMember();
  if (error) return { ok: false, message: error };
  if (!user.accessToken) return { ok: false, message: "登录已过期，请重新登录" };

  const repo = db.getRepoById(repoId);
  if (!repo) return { ok: false, message: "仓库不存在" };
  if (!repo.isAvailable) return { ok: false, message: "仓库暂不可访问，已有 Star 记录保留" };
  if (repo.owner.toLowerCase() === user.login.toLowerCase()) {
    return { ok: false, message: "不能 Star 自己的仓库" };
  }

  let starred = false;
  try {
    starred = await hasStarred(user.accessToken, user.login, repo.owner, repo.name);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  if (!starred) {
    return { ok: false, message: "GitHub 上未检测到 Star 记录" };
  }

  db.upsertStar(user.id, repoId);
  await refreshRepoMeta(repo, user.accessToken);
  revalidateAll();
  return { ok: true, message: "已同步" };
}

export async function deleteRepo(repoId: number): Promise<ActionResult> {
  const { error, user } = await requireMember();
  if (error) return { ok: false, message: error };

  const repo = db.getRepoById(repoId);
  if (!repo) return { ok: false, message: "仓库不存在" };
  if (repo.submitterId !== user.id && !user.isAdmin) {
    return { ok: false, message: "仅可删除自己录入的仓库" };
  }

  db.deleteRepo(repoId);
  revalidateAll();
  return { ok: true, message: "已删除" };
}

export async function acknowledgeReceivedStars(notificationIds: number[]): Promise<ActionResult> {
  const { error, user } = await requireMember();
  if (error) return { ok: false, message: error };

  db.markReceivedStarsSeen(user.id, notificationIds);
  revalidateAll();
  return { ok: true, message: "已读" };
}

export async function joinWithCode(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录 GitHub" };
  if (user.approved) return { ok: true, message: "已加入" };

  const code = String(formData.get("code") ?? "").trim();
  const expected = process.env.INVITE_CODE;
  if (expected && code !== expected) return { ok: false, message: "口令错误" };

  db.approveUser(user.id);
  revalidateAll();
  return { ok: true, message: "已加入" };
}
