"use client";

import { linkRepoSchema, type GitHubStatusDto } from "@devsync/shared";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useGitHubMutations } from "../../api/github-api";

const TOKEN_HELP =
  "Fine-grained token with Issues (read and write), Pull requests, Checks, and Metadata (read).";

export function GitHubLinkForm({
  boardId,
  status,
  submitLabel = "Link repository",
}: {
  boardId: string;
  status: GitHubStatusDto;
  submitLabel?: string;
}) {
  const { link } = useGitHubMutations(boardId);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const canPushWithoutToken = status.appConfigured;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = linkRepoSchema.safeParse({
      repo: form.get("repo"),
      token: form.get("token") || undefined,
      pushEnabled: form.get("push") === "on",
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form");
    setError(null);
    link.mutate(parsed.data, { onError: (err) => setError(err.message) });
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="github-repo">Repository</Label>
        <Input
          id="github-repo"
          name="repo"
          placeholder="owner/name or GitHub URL"
          className="font-mono"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="github-token">
          Access token <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="github-token"
          name="token"
          type="password"
          autoComplete="off"
          placeholder="github_pat_…"
          onChange={(event) => setHasToken(event.target.value.trim().length > 0)}
        />
        <p className="text-xs text-muted-foreground">
          Public repos sync without one, read-only. {TOKEN_HELP} Stored encrypted.
          {status.appConfigured &&
            " Or install the DevSync GitHub App on the repo and skip the token."}
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="push"
          className="mt-0.5 size-4 accent-primary"
          disabled={!hasToken && !canPushWithoutToken}
        />
        <span>
          Update GitHub when cards move
          <span className="block text-xs text-muted-foreground">
            Uses each column&apos;s rule, for example closing issues in Done.
            {!hasToken && !canPushWithoutToken && " Needs a token."}
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={link.isPending}>
        {link.isPending ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <GitHubIcon data-icon="inline-start" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
