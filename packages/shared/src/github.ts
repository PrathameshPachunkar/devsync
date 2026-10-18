import { z } from "zod";

/**
 * How the API authenticates to GitHub for a linked repository:
 * - app: GitHub App installation token (production setup)
 * - token: a personal access token the admin supplied, encrypted at rest
 * - public: read-only access to a public repo, no credentials
 * - demo: seeded sample data that is never synced
 */
export type GitHubAuthMode = "app" | "token" | "public" | "demo";

export type GitHubSyncStatus = "idle" | "syncing" | "error";

export interface GitHubLinkDto {
  owner: string;
  name: string;
  htmlUrl: string;
  authMode: GitHubAuthMode;
  /** Card moves update GitHub (needs app or token access). */
  pushEnabled: boolean;
  canPush: boolean;
  webhookActive: boolean;
  syncStatus: GitHubSyncStatus;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  /** Card moves still waiting to reach GitHub. */
  pendingPushes: number;
  failedPushes: number;
}

export interface GitHubStatusDto {
  link: GitHubLinkDto | null;
  /** Server-side capabilities, so the UI can explain what is possible. */
  appConfigured: boolean;
  webhooksConfigured: boolean;
}

// GitHub usernames: alphanumerics and single hyphens, no leading hyphen, at most 39 characters.
const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
// Repo names: letters, digits, ".", "-", "_". "." and ".." are path segments, never names.
const namePattern = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * Accepts "owner/name", "github.com/owner/name", or a full URL, optionally
 * with a trailing .git or path. Returns null when it isn't a repository.
 */
export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const [owner, name] = cleaned.split("/");
  // Strict on purpose: these values become URL path segments in authenticated
  // GitHub requests, and a ".." segment would redirect the call elsewhere.
  if (!owner || !name || !ownerPattern.test(owner) || !namePattern.test(name)) return null;
  if (name === "." || name === "..") return null;
  return { owner, name };
}

export const linkRepoSchema = z.object({
  repo: z
    .string()
    .trim()
    .min(1, "Required")
    .refine((value) => parseRepoInput(value) !== null, "Use owner/name or a GitHub URL"),
  /** Fine-grained personal access token. Optional for public repos or the GitHub App. */
  token: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => value || undefined),
  pushEnabled: z.boolean().default(false),
});
export type LinkRepoInput = z.infer<typeof linkRepoSchema>;

export const updateLinkSchema = z.object({ pushEnabled: z.boolean() });

const labelName = z.string().trim().min(1).max(50);

export const githubRuleSchema = z
  .object({
    state: z.enum(["open", "closed"]).optional(),
    addLabels: z.array(labelName).max(10).optional(),
    removeLabels: z.array(labelName).max(10).optional(),
  })
  .transform((rule) => {
    // Normalize: drop empty parts so "no change" is always stored as null.
    const out: { state?: "open" | "closed"; addLabels?: string[]; removeLabels?: string[] } = {};
    if (rule.state) out.state = rule.state;
    if (rule.addLabels?.length) out.addLabels = [...new Set(rule.addLabels)];
    if (rule.removeLabels?.length) out.removeLabels = [...new Set(rule.removeLabels)];
    return Object.keys(out).length > 0 ? out : null;
  })
  .nullable();
