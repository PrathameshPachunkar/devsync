import type { ChecksStatus, GitHubItemKind, GitHubItemState } from "@devsync/shared";

import type { GhIssue, GhLabel, GhPull, GhUser } from "./client";

/** A GitHub issue or PR, normalized to what a DevSync card mirrors. */
export interface RemoteItem {
  repo: string;
  number: number;
  kind: GitHubItemKind;
  title: string;
  body: string | null;
  state: GitHubItemState;
  /** For the next three fields, undefined means not fetched: keep the stored value. */
  isDraft: boolean | undefined;
  htmlUrl: string;
  headRef: string | null | undefined;
  headSha: string | null | undefined;
  checksStatus: ChecksStatus | null | undefined;
  labels: { name: string; color: string }[];
  assignees: { login: string; avatarUrl: string | null }[];
  updatedAt: Date;
}

const MAX_BODY = 10_000;

function labelsOf(labels: (GhLabel | string)[]) {
  return labels.map((label) =>
    typeof label === "string"
      ? { name: label, color: "8b949e" }
      : { name: label.name, color: label.color || "8b949e" },
  );
}

function assigneesOf(users: GhUser[] | null) {
  return (users ?? []).map((user) => ({ login: user.login, avatarUrl: user.avatar_url ?? null }));
}

function bodyOf(body: string | null) {
  return body ? body.slice(0, MAX_BODY) : null;
}

export function fromPull(repo: string, pull: GhPull, checks?: ChecksStatus | null): RemoteItem {
  return {
    repo,
    number: pull.number,
    kind: "pull_request",
    title: pull.title,
    body: bodyOf(pull.body),
    state: pull.merged_at ? "merged" : pull.state,
    isDraft: Boolean(pull.draft),
    htmlUrl: pull.html_url,
    headRef: pull.head.ref,
    headSha: pull.head.sha,
    checksStatus: checks,
    labels: labelsOf(pull.labels),
    assignees: assigneesOf(pull.assignees),
    updatedAt: new Date(pull.updated_at),
  };
}

/** Issues, plus PRs when the PR details weren't fetched (state comes from the issue view). */
export function fromIssue(repo: string, issue: GhIssue): RemoteItem {
  const isPull = Boolean(issue.pull_request);
  return {
    repo,
    number: issue.number,
    kind: isPull ? "pull_request" : "issue",
    title: issue.title,
    body: bodyOf(issue.body),
    state: isPull && issue.pull_request?.merged_at ? "merged" : issue.state,
    // The issues endpoint has no PR branch or draft data.
    isDraft: isPull ? undefined : false,
    htmlUrl: issue.html_url,
    headRef: isPull ? undefined : null,
    headSha: isPull ? undefined : null,
    checksStatus: undefined,
    labels: labelsOf(issue.labels),
    assignees: assigneesOf(issue.assignees),
    updatedAt: new Date(issue.updated_at),
  };
}

export const isClosed = (state: GitHubItemState) => state !== "open";
