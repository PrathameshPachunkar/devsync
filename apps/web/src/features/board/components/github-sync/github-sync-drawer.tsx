"use client";

import type { GitHubAuthMode, GitHubLinkDto } from "@devsync/shared";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useMemo, useState } from "react";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { useGitHubMutations, useGitHubStatus } from "../../api/github-api";
import { useBoardAccentScope } from "../../hooks/use-board-accent-scope";
import { useBoardPermission } from "../../hooks/use-board-permission";
import { useBoardStore } from "../../store/board-store";
import { GitHubColumnRules } from "./github-column-rules";
import { GitHubLinkForm } from "./github-link-form";

const AUTH_LABELS: Record<GitHubAuthMode, string> = {
  app: "GitHub App",
  token: "Access token",
  public: "Public, read-only",
  demo: "Demo data",
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, "second");
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}

/** Lazy-loaded panel: link a repository, watch sync status, and set push rules. */
export function GitHubSyncDrawer({ onClose }: { onClose: () => void }) {
  const boardId = useBoardStore((state) => state.boardId);
  const accentScope = useBoardAccentScope();
  const { data: status, isPending, error } = useGitHubStatus(boardId);
  const canLink = useBoardPermission("repo:link");

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent {...accentScope} className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <GitHubIcon className="size-4" />
            GitHub sync
          </SheetTitle>
          <SheetDescription>
            Issues and pull requests become cards, and card moves can update GitHub.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 p-4">
          {isPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : status.link ? (
            <LinkedRepo link={status.link} status={status} />
          ) : canLink ? (
            <GitHubLinkForm boardId={boardId} status={status} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No repository is linked. A board admin can link one.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LinkedRepo({
  link,
  status,
}: {
  link: GitHubLinkDto;
  status: NonNullable<ReturnType<typeof useGitHubStatus>["data"]>;
}) {
  const boardId = useBoardStore((state) => state.boardId);
  const cards = useBoardStore((state) => state.cards);
  const canLink = useBoardPermission("repo:link");
  const canSync = useBoardPermission("github:sync");
  const canConfigure = useBoardPermission("sync:configure");
  const { sync, update, unlink } = useGitHubMutations(boardId);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const isDemo = link.authMode === "demo";

  const stats = useMemo(() => {
    let issues = 0;
    let pulls = 0;
    for (const card of Object.values(cards)) {
      if (card.github?.kind === "issue") issues += 1;
      else if (card.github) pulls += 1;
    }
    return { issues, pulls };
  }, [cards]);

  return (
    <>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={link.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-sm font-medium hover:underline"
          >
            {link.owner}/{link.name}
            <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(opens GitHub)</span>
          </a>
          <Badge variant="secondary">{AUTH_LABELS[link.authMode]}</Badge>
        </div>

        <SyncState link={link} />

        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Issues" value={stats.issues} />
          <Stat label="Pull requests" value={stats.pulls} />
        </dl>

        {!isDemo && canSync && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => sync.mutate()}
            disabled={sync.isPending || link.syncStatus === "syncing"}
          >
            <RefreshCw
              data-icon="inline-start"
              className={link.syncStatus === "syncing" ? "animate-spin" : undefined}
            />
            Sync now
          </Button>
        )}
        {sync.error && <p className="text-xs text-destructive">{sync.error.message}</p>}
      </section>

      {!isDemo && (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Updates to GitHub</h3>
          {link.canPush ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={link.pushEnabled}
                disabled={!canLink || update.isPending}
                onChange={(event) => update.mutate(event.target.checked)}
              />
              <span>
                Update GitHub when cards move
                <span className="block text-xs text-muted-foreground">
                  {link.pendingPushes > 0
                    ? `${link.pendingPushes} update${link.pendingPushes === 1 ? "" : "s"} waiting to send.`
                    : "Changes are queued and retried if GitHub is unavailable."}
                  {link.failedPushes > 0 &&
                    ` ${link.failedPushes} could not be applied. Check the token's permissions.`}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              Read-only access. Re-link with a token or the GitHub App to update GitHub.
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            {link.webhookActive
              ? "Live: GitHub sends changes by webhook."
              : "Checks GitHub for changes every few minutes."}
          </p>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Column rules</h3>
        <p className="text-xs text-muted-foreground">
          What moving a linked card into each column does on GitHub
          {isDemo
            ? ". Try them here: demo boards never push"
            : !link.pushEnabled
              ? ", once updates are turned on"
              : ""}
          .
        </p>
        <GitHubColumnRules editable={canConfigure} />
      </section>

      {canLink && (
        <section className="grid gap-3 border-t pt-4">
          {isDemo ? (
            replacing ? (
              <GitHubLinkForm boardId={boardId} status={status} submitLabel="Link and sync" />
            ) : (
              <>
                <p className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  This sandbox shows sample GitHub data. Link a real public repository to see live
                  sync.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => setReplacing(true)}
                >
                  <GitHubIcon data-icon="inline-start" />
                  Link a real repository
                </Button>
              </>
            )
          ) : confirmUnlink ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Unlink? Cards stay, as plain cards.
              <Button
                variant="destructive"
                size="sm"
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
              >
                Unlink
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmUnlink(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setConfirmUnlink(true)}
            >
              <Unlink data-icon="inline-start" />
              Unlink repository
            </Button>
          )}
        </section>
      )}
    </>
  );
}

function SyncState({ link }: { link: GitHubLinkDto }) {
  if (link.authMode === "demo") {
    return <p className="text-sm text-muted-foreground">Sample data. Not connected to GitHub.</p>;
  }
  if (link.syncStatus === "syncing") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Syncing with GitHub…
      </p>
    );
  }
  if (link.syncStatus === "error") {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {link.lastSyncError ?? "The last sync failed"}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
      {link.lastSyncedAt ? `Synced ${timeAgo(link.lastSyncedAt)}` : "Waiting for the first sync"}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
