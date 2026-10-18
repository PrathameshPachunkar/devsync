import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getGitHubStateMeta } from "./github-state";
import { GitHubStateBadge } from "./github-state-badge";

describe("getGitHubStateMeta", () => {
  it.each([
    ["issue", "open", false, "Open", "open"],
    ["issue", "closed", false, "Closed", "merged"],
    ["pull_request", "open", false, "Open", "open"],
    ["pull_request", "open", true, "Draft", "draft"],
    ["pull_request", "merged", false, "Merged", "merged"],
    ["pull_request", "closed", false, "Closed", "closed"],
  ] as const)("%s/%s draft=%s is %s (%s tone)", (kind, state, isDraft, label, tone) => {
    expect(getGitHubStateMeta(kind, state, isDraft)).toMatchObject({ label, tone });
  });
});

describe("<GitHubStateBadge />", () => {
  it("announces state and item type to assistive tech", () => {
    render(<GitHubStateBadge kind="pull_request" state="merged" />);
    expect(screen.getByText("Merged").textContent).toBe("Merged pull request");
  });
});
