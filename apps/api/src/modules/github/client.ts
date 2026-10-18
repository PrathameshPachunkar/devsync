import type { ChecksStatus } from "@devsync/shared";

/**
 * Minimal, typed GitHub REST client over fetch. It covers only the endpoints
 * DevSync uses, so there's no SDK dependency, and tests inject a fake fetch.
 */

export interface GhLabel {
  name: string;
  color: string;
}
export interface GhUser {
  login: string;
  avatar_url: string | null;
}
export interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  updated_at: string;
  labels: (GhLabel | string)[];
  assignees: GhUser[] | null;
  /** Present when the "issue" is a pull request. */
  pull_request?: { merged_at?: string | null } | null;
}
export interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  html_url: string;
  updated_at: string;
  head: { ref: string; sha: string };
  labels: (GhLabel | string)[];
  assignees: GhUser[] | null;
}
interface GhCheckRun {
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
  conclusion: string | null;
}

export interface RemoteRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  /** Only known when authenticated. */
  canPush: boolean;
}

export type GitHubErrorKind =
  "not_found" | "unauthorized" | "forbidden" | "rate_limited" | "validation" | "unavailable";

export class GitHubApiError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    readonly status: number,
    message: string,
    readonly resetAt?: Date,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubClientOptions {
  fetch: typeof fetch;
  apiUrl: string;
  token: string | null;
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

/** Aggregates check runs the way GitHub's PR badge does. */
export function aggregateCheckRuns(runs: GhCheckRun[]): ChecksStatus | null {
  if (runs.length === 0) return null;
  const failing = new Set([
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "startup_failure",
  ]);
  if (runs.some((r) => r.status === "completed" && r.conclusion && failing.has(r.conclusion))) {
    return "failure";
  }
  if (runs.some((r) => r.status !== "completed")) return "pending";
  return "success";
}

function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match) return match[1]!;
  }
  return null;
}

export function createGitHubClient({ fetch: fetchImpl, apiUrl, token }: GitHubClientOptions) {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "devsync",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  async function send(method: string, url: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url.startsWith("http") ? url : `${apiUrl}${url}`, {
        method,
        headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new GitHubApiError("unavailable", 0, "Can't reach GitHub");
    }
    if (response.ok) return response;

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    const message = payload?.message ?? `GitHub responded ${response.status}`;
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    const retryAfter = response.headers.get("retry-after");
    if (response.status === 429 || (response.status === 403 && (remaining === "0" || retryAfter))) {
      const resetAt = reset
        ? new Date(Number(reset) * 1000)
        : new Date(Date.now() + Number(retryAfter ?? 60) * 1000);
      throw new GitHubApiError(
        "rate_limited",
        response.status,
        "GitHub rate limit reached",
        resetAt,
      );
    }
    const kind: GitHubErrorKind =
      response.status === 404
        ? "not_found"
        : response.status === 401
          ? "unauthorized"
          : response.status === 403
            ? "forbidden"
            : response.status === 422
              ? "validation"
              : "unavailable";
    throw new GitHubApiError(kind, response.status, message);
  }

  async function json<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await send(method, url, body);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  /** Follows Link: rel="next" until `limit` items are collected. */
  async function paginate<T>(url: string, limit: number): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = url;
    while (next && items.length < limit) {
      const response = await send("GET", next);
      items.push(...((await response.json()) as T[]));
      next = nextLink(response.headers.get("link"));
    }
    return items.slice(0, limit);
  }

  const repoPath = (repo: string) => `/repos/${repo}`;

  return {
    async getRepo(owner: string, name: string): Promise<RemoteRepo> {
      const r = await json<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
        owner: { login: string };
        permissions?: { push?: boolean };
      }>("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
      return {
        id: r.id,
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
        canPush: Boolean(r.permissions?.push),
      };
    },

    /** Issues and PRs, most recently updated first. `since` makes it incremental. */
    listIssues(repo: string, options: { state: "open" | "all"; since?: Date; limit: number }) {
      const params = new URLSearchParams({
        state: options.state,
        sort: "updated",
        direction: "desc",
        per_page: "100",
      });
      if (options.since) params.set("since", options.since.toISOString());
      return paginate<GhIssue>(`${repoPath(repo)}/issues?${params}`, options.limit);
    },

    listPulls(repo: string, options: { state: "open" | "all"; limit: number }) {
      const params = new URLSearchParams({
        state: options.state,
        sort: "updated",
        direction: "desc",
        per_page: "100",
      });
      return paginate<GhPull>(`${repoPath(repo)}/pulls?${params}`, options.limit);
    },

    getPull: (repo: string, number: number) =>
      json<GhPull>("GET", `${repoPath(repo)}/pulls/${number}`),

    async getChecksStatus(repo: string, sha: string): Promise<ChecksStatus | null> {
      const result = await json<{ check_runs: GhCheckRun[] }>(
        "GET",
        `${repoPath(repo)}/commits/${sha}/check-runs?per_page=100`,
      );
      return aggregateCheckRuns(result.check_runs);
    },

    setIssueState: (repo: string, number: number, state: "open" | "closed") =>
      json<GhIssue>("PATCH", `${repoPath(repo)}/issues/${number}`, { state }),

    addLabels: (repo: string, number: number, labels: string[]) =>
      json<GhLabel[]>("POST", `${repoPath(repo)}/issues/${number}/labels`, { labels }),

    async removeLabel(repo: string, number: number, label: string): Promise<void> {
      try {
        await send(
          "DELETE",
          `${repoPath(repo)}/issues/${number}/labels/${encodeURIComponent(label)}`,
        );
      } catch (error) {
        // Already absent: the desired end state holds.
        if (!(error instanceof GitHubApiError && error.kind === "not_found")) throw error;
      }
    },

    async createWebhook(repo: string, url: string, secret: string): Promise<number> {
      const hook = await json<{ id: number }>("POST", `${repoPath(repo)}/hooks`, {
        name: "web",
        active: true,
        events: ["issues", "pull_request", "check_suite", "check_run"],
        config: { url, content_type: "json", secret, insecure_ssl: "0" },
      });
      return hook.id;
    },

    async deleteWebhook(repo: string, id: number): Promise<void> {
      await send("DELETE", `${repoPath(repo)}/hooks/${id}`);
    },
  };
}
