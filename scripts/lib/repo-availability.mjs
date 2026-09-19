/** @param {import('node:sqlite').DatabaseSync} db */
export function ensureRepositoryAvailabilitySchema(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns = db.prepare('PRAGMA table_info(repos)').all();
    if (!columns.some((column) => column.name === 'is_available')) {
      db.exec('ALTER TABLE repos ADD COLUMN is_available INTEGER NOT NULL DEFAULT 1');
    }
    if (!columns.some((column) => column.name === 'availability_checked_at')) {
      db.exec('ALTER TABLE repos ADD COLUMN availability_checked_at TEXT');
    }
    if (!columns.some((column) => column.name === 'github_id')) {
      db.exec('ALTER TABLE repos ADD COLUMN github_id TEXT');
    }
    // 首次被确认失效（404 / 转私有）的时间；持续失效超过宽限期后自动删除
    if (!columns.some((column) => column.name === 'unavailable_since')) {
      db.exec('ALTER TABLE repos ADD COLUMN unavailable_since TEXT');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_github_id ON repos(github_id) WHERE github_id IS NOT NULL');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function readRepositoryIdentity(data) {
  if (!Number.isSafeInteger(data?.id) || data.id <= 0 || !Number.isSafeInteger(data.owner?.id)
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(data.full_name ?? '')) {
    throw new Error('GitHub 返回的仓库标识无效，稍后重试');
  }
  const [owner, name] = data.full_name.split('/');
  return { githubId: String(data.id), fullName: data.full_name, owner, name,
    htmlUrl: `https://github.com/${data.full_name}`, ownerId: String(data.owner.id) };
}

/** Caller owns the transaction; identity changes must retain the local repository ID. */
export function updateRepositoryIdentity(db, repoId, identity) {
  const current = db.prepare('SELECT github_id FROM repos WHERE id = ?').get(repoId);
  if (!current) return;
  if (current.github_id && current.github_id !== identity.githubId) {
    throw new Error('GitHub 仓库标识不一致，已保留原记录');
  }
  const conflict = db.prepare(`SELECT id FROM repos WHERE id <> ? AND
    (github_id = ? OR lower(full_name) = lower(?))`).get(repoId, identity.githubId, identity.fullName);
  if (conflict) throw new Error('GitHub 仓库标识冲突，已保留原记录');
  db.prepare('UPDATE repos SET github_id = ?, full_name = ?, owner = ?, name = ?, html_url = ? WHERE id = ?')
    .run(identity.githubId, identity.fullName, identity.owner, identity.name, identity.htmlUrl, repoId);
  // A transfer must not rename the submitter or change ownership of site records.
  db.prepare(`UPDATE users SET login = ? WHERE id = ? AND NOT EXISTS
    (SELECT 1 FROM users WHERE lower(login) = lower(?) AND id <> ?)`)
    .run(identity.owner, identity.ownerId, identity.owner, identity.ownerId);
}

/** 默认宽限期：仓库被连续确认失效满 72 小时后才自动删除；可用环境变量 REPO_PURGE_GRACE_HOURS 覆盖，<=0 关闭自动删除 */
export function resolvePurgeGraceHours(value = process.env.REPO_PURGE_GRACE_HOURS) {
  if (value === undefined || value === null || String(value).trim() === '') return 72;
  const hours = Number(value);
  return Number.isFinite(hours) ? hours : 72;
}

/**
 * Only a successful public response or an explicit 404 changes visibility.
 * Uncertain responses never authorize removing historical Star records.
 *
 * 自动删除：明确失效（404 / 转私有）的仓库先被隐藏并记录 unavailable_since；之后每轮同步都再次确认失效、
 * 且持续时间超过宽限期，才连同其 Star 记录一起删除。单轮失效数量异常（疑似 token 失效 / 网络故障）时跳过删除。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{token?: string, dryRun?: boolean, repoIds?: number[], purgeAfterHours?: number}} options
 */
export async function syncRepositoryAvailability(db, { token, dryRun = false, repoIds, purgeAfterHours = resolvePurgeGraceHours() } = {}) {
  if (!dryRun) ensureRepositoryAvailabilitySchema(db);
  const columns = new Set(db.prepare('PRAGMA table_info(repos)').all().map((column) => column.name));
  const rows = db.prepare(`SELECT id, full_name, ${columns.has('is_available') ? 'is_available' : '1 AS is_available'},
    ${columns.has('github_id') ? 'github_id' : 'NULL AS github_id'} FROM repos ORDER BY id`).all();
  const requested = repoIds ? new Set(repoIds) : null;
  const repos = rows.filter((repo) => !requested || requested.has(Number(repo.id)));
  const startedAt = new Date().toISOString();
  const deadline = AbortSignal.timeout(30_000);
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'star-hub-availability-sync',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  /** @type {{id: number, fullName: string, available: boolean, previous: boolean, identity?: ReturnType<typeof readRepositoryIdentity>}[]} */
  const results = [];
  /** @type {{fullName: string, message: string}[]} */
  const errors = [];
  let cursor = 0;
  let throttled = false;
  async function worker() {
    while (cursor < repos.length) {
      const repo = repos[cursor++];
      const fullName = String(repo.full_name);
      try {
        if (throttled) throw new Error('GitHub 限流，稍后重试');
        const path = repo.github_id ? `repositories/${encodeURIComponent(String(repo.github_id))}`
          : `repos/${fullName.split('/').map(encodeURIComponent).join('/')}`;
        const response = await fetch(`https://api.github.com/${path}`, {
          headers, cache: 'no-store', signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
        });
        let available;
        let identity;
        let meta;
        if (response.status === 404) available = false;
        else if (!response.ok) {
          if (response.status === 429 || response.status === 403) throttled = true;
          throw new Error(`GitHub HTTP ${response.status}，稍后重试`);
        } else {
          const data = await response.json();
          if (typeof data.private !== 'boolean') throw new Error('GitHub 返回的仓库状态无效，稍后重试');
          available = !data.private;
          if (available) {
            identity = readRepositoryIdentity(data);
            if (repo.github_id && repo.github_id !== identity.githubId) {
              throw new Error('GitHub 仓库标识不一致，已保留原记录');
            }
            // 顺带刷新 GitHub Star 数等元数据：这次请求已经拿到了完整仓库信息，不额外消耗 API 额度
            meta = {
              stargazers: Number.isSafeInteger(data.stargazers_count) && data.stargazers_count >= 0 ? data.stargazers_count : null,
              description: typeof data.description === 'string' ? data.description : null,
              language: typeof data.language === 'string' ? data.language : null,
            };
          }
        }
        results.push({ id: Number(repo.id), fullName, available, previous: Number(repo.is_available) === 1, identity, meta });
      } catch (error) {
        errors.push({ fullName, message: error instanceof Error && error.message.startsWith('GitHub ')
          ? error.message : '仓库状态核验失败，请稍后重试' });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, repos.length) }, () => worker()));

  /** @type {string[]} */
  const purged = [];
  /** @type {string | null} */
  let purgeSkipped = null;
  if (!dryRun) {
    // 失效时记录首次失效时间（已有则保留），恢复可用时清空
    const update = db.prepare(`UPDATE repos SET is_available = ?, availability_checked_at = ?,
        unavailable_since = CASE WHEN ? = 0 THEN COALESCE(unavailable_since, ?) ELSE NULL END
      WHERE id = ? AND (availability_checked_at IS NULL OR availability_checked_at <= ?)`);
    // 精简 schema（如测试库）可能没有这些列；prepare 阶段就会校验列名，所以整体按列存在与否决定是否创建
    const updateMeta = ['stargazers', 'description', 'language', 'updated_at'].every((column) => columns.has(column))
      ? db.prepare(`UPDATE repos SET stargazers = ?, description = ?, language = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      : null;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of results) {
        const current = db.prepare('SELECT availability_checked_at FROM repos WHERE id = ?').get(row.id);
        if (!current || (current.availability_checked_at && current.availability_checked_at > startedAt)) continue;
        try {
          if (row.identity) updateRepositoryIdentity(db, row.id, row.identity);
          if (updateMeta && row.meta && row.meta.stargazers !== null) {
            updateMeta.run(row.meta.stargazers, row.meta.description, row.meta.language, row.id);
          }
          const availableFlag = row.available ? 1 : 0;
          update.run(availableFlag, startedAt, availableFlag, startedAt, row.id, startedAt);
        } catch (error) {
          errors.push({ fullName: row.fullName, message: error instanceof Error ? error.message : '仓库地址更新失败' });
          row.identity = undefined;
        }
      }

      // 自动删除持续失效的仓库（外键 ON DELETE CASCADE 会一并清掉其 Star 与通知记录）
      if (purgeAfterHours > 0) {
        const confirmedGone = results.filter((row) => !row.available);
        // 安全阀：单轮失效数量异常时，更可能是 token 失效 / 网络故障 / 被限流，而不是大家同时删库
        const threshold = Math.max(3, Math.ceil(repos.length * 0.3));
        if (confirmedGone.length > threshold) {
          purgeSkipped = `本轮 ${confirmedGone.length}/${repos.length} 个仓库返回失效，超过安全阈值 ${threshold}，已跳过自动删除`;
        } else if (confirmedGone.length > 0) {
          const cutoff = new Date(Date.parse(startedAt) - purgeAfterHours * 3_600_000).toISOString();
          const expired = db.prepare(`SELECT id, full_name FROM repos
            WHERE is_available = 0 AND unavailable_since IS NOT NULL AND unavailable_since <= ?
              AND id IN (${confirmedGone.map(() => '?').join(',')})`).all(cutoff, ...confirmedGone.map((row) => row.id));
          const remove = db.prepare('DELETE FROM repos WHERE id = ?');
          for (const repo of expired) {
            remove.run(repo.id);
            purged.push(String(repo.full_name));
          }
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const currentlyAvailable = new Set(dryRun ? results.filter((row) => row.available).map((row) => row.id)
    : db.prepare('SELECT id FROM repos WHERE is_available = 1').all().map((row) => Number(row.id)));
  return {
    checked: results.length,
    identities: results.filter((row) => row.identity && currentlyAvailable.has(row.id))
      .map((row) => ({ repoId: row.id, ...row.identity })),
    verifiedRepoIds: results.filter((row) => row.identity && currentlyAvailable.has(row.id)).map((row) => row.id),
    unavailable: results.filter((row) => !row.available).map((row) => row.fullName),
    restored: results.filter((row) => row.available && !row.previous && currentlyAvailable.has(row.id)).map((row) => row.fullName),
    errors,
    /** 本轮因持续失效被自动删除的仓库 */
    purged,
    /** 非空表示本轮触发了安全阀、跳过了自动删除的原因 */
    purgeSkipped,
  };
}
