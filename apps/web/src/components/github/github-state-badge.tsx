import {
  CircleCheck,
  CircleDot,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from "lucide-react";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  getGitHubStateMeta,
  type GitHubItemKind,
  type GitHubItemState,
  type GitHubStateMeta,
  type GitHubStateTone,
} from "./github-state";

const ICONS: Readonly<Record<GitHubStateMeta["icon"], LucideIcon>> = {
  "issue-open": CircleDot,
  "issue-closed": CircleCheck,
  "pr-open": GitPullRequest,
  "pr-draft": GitPullRequestDraft,
  "pr-merged": GitMerge,
  "pr-closed": GitPullRequestClosed,
};

const TONE_CLASSES: Readonly<Record<GitHubStateTone, string>> = {
  open: "border-gh-open/30 bg-gh-open/10 text-gh-open",
  merged: "border-gh-merged/30 bg-gh-merged/10 text-gh-merged",
  closed: "border-gh-closed/30 bg-gh-closed/10 text-gh-closed",
  draft: "border-gh-draft/30 bg-gh-draft/10 text-gh-draft",
};

interface GitHubStateBadgeProps {
  kind: GitHubItemKind;
  state: GitHubItemState;
  isDraft?: boolean;
  className?: string;
}

/** Status pill for synced issues and PRs. Memoized: it renders inside every task card. */
export const GitHubStateBadge = memo(function GitHubStateBadge({
  kind,
  state,
  isDraft = false,
  className,
}: GitHubStateBadgeProps) {
  const meta = getGitHubStateMeta(kind, state, isDraft);
  const Icon = ICONS[meta.icon];
  const noun = kind === "issue" ? "issue" : "pull request";

  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[meta.tone], className)}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      {meta.label}
      <span className="sr-only"> {noun}</span>
    </Badge>
  );
});
