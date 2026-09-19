import { readRepositoryIdentity } from "../../scripts/lib/repo-availability.mjs";

const API = "https://api.github.com";

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "star-hub",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export type GitHubRepo = {
  githubId: string;
  ownerId: string;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  htmlUrl: string;
  ownerAvatar: string;
};

/**
 * 支持输入 "owner/repo" 或完整 GitHub URL。
 */
export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:[#?].*)?$/i,
  );
  if (urlMatch) return { owner: urlMatch[1], name: urlMatch[2] };
  const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shortMatch) return { owner: shortMatch[1], name: shortMatch[2] };
  return null;
}

export async function fetchRepo(owner: string, name: string, token?: string): Promise<GitHubRepo | null> {
  const res = await fetch(`${API}/repos/${owner}/${name}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API 错误: ${res.status}`);
  const data = await res.json();
  if (data.private !== false) return null;
  return {
    ...readRepositoryIdentity(data),
    description: data.description ?? null,
    language: data.language ?? null,
    stargazers: data.stargazers_count ?? 0,
    ownerAvatar: data.owner.avatar_url,
  };
}

export type OwnRepo = {
  fullName: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  htmlUrl: string;
  fork: boolean;
  archived: boolean;
  pushedAt: string;
};

/** 当前用户自己拥有的公开仓库，按最近推送排序（最多 200 个） */
export async function listOwnRepos(token: string): Promise<OwnRepo[]> {
  const out: OwnRepo[] = [];
  for (let page = 1; page <= 2; page++) {
    const res = await fetch(
      `${API}/user/repos?affiliation=owner&visibility=public&sort=pushed&direction=desc&per_page=100&page=${page}`,
      { headers: headers(token), cache: "no-store" },
    );
    if (res.status === 401) throw new NeedReauthError();
    if (res.status === 403) {
      const message = res.headers.get("x-ratelimit-remaining") === "0"
        ? "GitHub API 额度已用完"
        : "GitHub 暂时拒绝读取 Star 列表";
      throw new Error(message);
    }
    if (!res.ok) throw new Error(`GitHub API 错误: ${res.status}`);
    const list: Array<{
      full_name: string;
      name: string;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      html_url: string;
      fork: boolean;
      archived: boolean;
      pushed_at: string;
    }> = await res.json();
    for (const r of list) {
      out.push({
        fullName: r.full_name,
        name: r.name,
        description: r.description,
        language: r.language,
        stargazers: r.stargazers_count ?? 0,
        htmlUrl: r.html_url,
        fork: r.fork,
        archived: r.archived,
        pushedAt: r.pushed_at,
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

export class NeedReauthError extends Error {
  constructor() {
    super("当前登录授权不包含 star 权限，请重新登录授权");
    this.name = "NeedReauthError";
  }
}

export class GitHubRateLimitError extends Error {
  retryAfterMs: number;
  primary: boolean;

  constructor(message: string, retryAfterMs: number, primary: boolean) {
    super(message);
    this.name = "GitHubRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.primary = primary;
  }
}

export type GitHubStarredRepo = {
  githubId: string;
  fullName: string;
  starredAt: string | null;
};

type StarredRepoResponse =
  | { starred_at?: string | null; repo?: { id?: number; full_name?: string } }
  | { id?: number; full_name?: string };

async function githubErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : "";
  } catch {
    return "";
  }
}

function rateLimitDelay(response: Response): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000 + 1000;

  const resetAt = Number(response.headers.get("x-ratelimit-reset")) * 1000;
  if (response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(resetAt)) {
    return Math.max(60_000, resetAt - Date.now() + 1000);
  }
  return 60_000;
}

async function isRateLimited(response: Response): Promise<boolean> {
  if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") return true;
  const message = await githubErrorMessage(response);
  return /rate limit|abuse detection/i.test(message);
}

async function listStarredRepos(url: string, token?: string): Promise<GitHubStarredRepo[]> {
  const out: GitHubStarredRepo[] = [];

  for (let page = 1; page <= 100; page++) {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${separator}sort=created&direction=desc&per_page=100&page=${page}`;
    const request = (accessToken?: string) => fetch(pageUrl, {
      headers: { ...(headers(accessToken) as Record<string, string>), Accept: "application/vnd.github.star+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    let res = await request(token);
    // 这是公开接口：旧会话 token 失效时，去掉 Authorization 仍可校验公开 Star。
    if (res.status === 401 && token) res = await request();
    if (res.status === 403 && token && !(await isRateLimited(res))) res = await request();
    if (res.status === 404) throw new Error("GitHub 用户暂不可访问，已保留原记录，请稍后重试");
    if (res.status === 401) throw new NeedReauthError();
    if (res.status === 403 || res.status === 429) {
      const primary = res.headers.get("x-ratelimit-remaining") === "0";
      throw new GitHubRateLimitError(
        primary ? "GitHub API 额度已用完，已暂停自动重试" : "GitHub 请求过于频繁，已暂停自动重试",
        rateLimitDelay(res),
        primary,
      );
    }
    if (!res.ok) throw new Error(`GitHub Star 列表获取失败: ${res.status}`);

    const list = (await res.json()) as StarredRepoResponse[];
    for (const item of list) {
      const wrapped = "repo" in item ? item.repo : undefined;
      const fullName = wrapped?.full_name ?? ("full_name" in item ? item.full_name : undefined);
      const id = wrapped?.id ?? ("id" in item ? item.id : undefined);
      if (!fullName || !Number.isSafeInteger(id) || !id || id <= 0) {
        throw new Error("GitHub 返回的 Star 列表无效，已保留原记录，请稍后重试");
      }
      out.push({
        githubId: String(id),
        fullName,
        starredAt: "starred_at" in item && typeof item.starred_at === "string" ? item.starred_at : null,
      });
    }

    if (list.length < 100) return out;
  }

  throw new Error("GitHub Star 列表超过同步上限，未改动站内记录");
}

/** 获取指定 GitHub 用户公开、真实的 Star 列表。 */
export function listUserStarredRepos(login: string, token?: string): Promise<GitHubStarredRepo[]> {
  return listStarredRepos(`${API}/users/${encodeURIComponent(login)}/starred`, token);
}

/**
 * 以当前用户身份 star 一个仓库（PUT /user/starred/{owner}/{repo}）。
 * 需要 public_repo scope；老 token 会返回 401/403/404，统一提示重新授权。
 */
export async function starRepo(token: string, owner: string, name: string): Promise<void> {
  const res = await fetch(`${API}/user/starred/${owner}/${name}`, {
    method: "PUT",
    headers: { ...(headers(token) as Record<string, string>), "Content-Length": "0" },
    cache: "no-store",
  });
  if (res.status === 204) return;
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new NeedReauthError();
  throw new Error(`GitHub API 错误: ${res.status}`);
}

/**
 * 校验当前登录用户是否已 star 某仓库。
 * 优先走 /user/starred/{owner}/{repo}（204/404）；若权限不足则回退扫描用户公开 starred 列表。
 */
export async function hasStarred(token: string, login: string, owner: string, name: string): Promise<boolean> {
  const res = await fetch(`${API}/user/starred/${owner}/${name}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (res.status === 204) return true;
  if (res.status === 404) return false;

  // 403 / 其他：回退到公开 starred 列表（按最近 star 时间倒序，扫前几页）
  const target = `${owner}/${name}`.toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(
      `${API}/users/${login}/starred?per_page=100&page=${page}&sort=created&direction=desc`,
      { headers: headers(token), cache: "no-store" },
    );
    if (!r.ok) throw new Error(`GitHub API 错误: ${r.status}`);
    const list: Array<{ full_name: string }> = await r.json();
    if (list.some((x) => x.full_name.toLowerCase() === target)) return true;
    if (list.length < 100) break;
  }
  return false;
}
