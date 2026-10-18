"use client";

import { ArrowRight, Info } from "lucide-react";
import { useMemo } from "react";

import { GitHubStateBadge } from "@/components/github/github-state-badge";
import { GitHubIcon } from "@/components/icons/github-icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { useBoardAccentScope } from "../../hooks/use-board-accent-scope";
import { useBoardStore } from "../../store/board-store";

/**
 * Lazy-loaded panel showing what the board mirrors from its linked
 * repository. The live sync engine (GitHub App, webhooks, push-back rules)
 * plugs in behind this UI later.
 */
export function GitHubSyncDrawer({ onClose }: { onClose: () => void }) {
  const repo = useBoardStore((state) => state.repoLabel);
  const cards = useBoardStore((state) => state.cards);
  const columnOrder = useBoardStore((state) => state.columnOrder);
  const columns = useBoardStore((state) => state.columns);
  const accentScope = useBoardAccentScope();

  const stats = useMemo(() => {
    let issues = 0;
    let pulls = 0;
    let open = 0;
    for (const card of Object.values(cards)) {
      if (!card.github) continue;
      if (card.github.kind === "issue") issues += 1;
      else pulls += 1;
      if (card.github.state === "open") open += 1;
    }
    return { issues, pulls, open };
  }, [cards]);

  const lastColumnId = columnOrder.at(-1);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent {...accentScope} className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <GitHubIcon className="size-4" />
            GitHub sync
          </SheetTitle>
          <SheetDescription>
            {repo ? (
              <>
                Mirrors issues and pull requests from{" "}
                <span className="font-mono text-foreground">{repo}</span>.
              </>
            ) : (
              "No repository is linked to this board."
            )}
          </SheetDescription>
        </SheetHeader>

        {repo ? (
          <div className="grid gap-6 p-4">
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Issues" value={stats.issues} />
              <Stat label="Pull requests" value={stats.pulls} />
              <Stat label="Still open" value={stats.open} />
            </dl>

            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Column rules</h3>
              <p className="text-xs text-muted-foreground">
                What moving a card into each column does on GitHub.
              </p>
              <ul className="divide-y rounded-lg border">
                {columnOrder.map((columnId) => {
                  const column = columns[columnId];
                  if (!column) return null;
                  const closes = columnId === lastColumnId;
                  return (
                    <li key={columnId} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{column.name}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      {closes ? (
                        <GitHubStateBadge kind="issue" state="closed" />
                      ) : (
                        <span className="text-xs text-muted-foreground">No change</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <p className="flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Live sync is not connected yet. Cards show the GitHub state captured in this demo
              data.
            </p>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            Link a repository to turn its issues and pull requests into cards.
          </p>
        )}
      </SheetContent>
    </Sheet>
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
