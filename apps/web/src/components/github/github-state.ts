export type GitHubItemKind = "issue" | "pull_request";
export type GitHubItemState = "open" | "closed" | "merged";

export type GitHubStateTone = "open" | "merged" | "closed" | "draft";

export interface GitHubStateMeta {
  readonly label: string;
  readonly tone: GitHubStateTone;
  readonly icon: "issue-open" | "issue-closed" | "pr-open" | "pr-draft" | "pr-merged" | "pr-closed";
}

/**
 * Mirrors GitHub's own conventions: a completed issue and a merged PR are
 * purple, a closed-unmerged PR is red, drafts are gray.
 */
export function getGitHubStateMeta(
  kind: GitHubItemKind,
  state: GitHubItemState,
  isDraft = false,
): GitHubStateMeta {
  if (kind === "issue") {
    return state === "open"
      ? { label: "Open", tone: "open", icon: "issue-open" }
      : { label: "Closed", tone: "merged", icon: "issue-closed" };
  }

  switch (state) {
    case "merged":
      return { label: "Merged", tone: "merged", icon: "pr-merged" };
    case "closed":
      return { label: "Closed", tone: "closed", icon: "pr-closed" };
    case "open":
      return isDraft
        ? { label: "Draft", tone: "draft", icon: "pr-draft" }
        : { label: "Open", tone: "open", icon: "pr-open" };
  }
}
