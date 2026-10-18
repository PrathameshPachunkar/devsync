"use client";

import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { GitHubStateBadge } from "@/components/github/github-state-badge";
import type { GitHubItemKind, GitHubItemState } from "@/components/github/github-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useBoardAccentScope } from "../../hooks/use-board-accent-scope";
import { useBoardStore } from "../../store/board-store";
import { computeBoardAnalytics } from "./compute-analytics";

const GITHUB_STATES: readonly {
  kind: GitHubItemKind;
  state: GitHubItemState;
  isDraft?: boolean;
  key: string;
}[] = [
  { kind: "issue", state: "open", key: "issue-open" },
  { kind: "issue", state: "closed", key: "issue-closed" },
  { kind: "pull_request", state: "open", isDraft: true, key: "pr-draft" },
  { kind: "pull_request", state: "open", key: "pr-open" },
  { kind: "pull_request", state: "merged", key: "pr-merged" },
  { kind: "pull_request", state: "closed", key: "pr-closed" },
];

/** Lazy-loaded. Everything is derived from the in-memory board view. */
export function BoardAnalyticsDialog({ onClose }: { onClose: () => void }) {
  const cards = useBoardStore((state) => state.cards);
  const columns = useBoardStore((state) => state.columns);
  const columnOrder = useBoardStore((state) => state.columnOrder);
  const accentScope = useBoardAccentScope();

  const analytics = useMemo(
    () => computeBoardAnalytics({ cards, columns, columnOrder }),
    [cards, columns, columnOrder],
  );
  const maxColumn = Math.max(
    1,
    ...analytics.columns.map((c) => Math.max(c.count, c.wipLimit ?? 0)),
  );
  const maxLabel = Math.max(1, ...analytics.labels.map((l) => l.count));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...accentScope} className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Board analytics</DialogTitle>
          <DialogDescription>A snapshot of this board as it is right now.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Cards" value={analytics.totalCards} />
          <Tile label="Linked to GitHub" value={`${analytics.linkedPercent}%`} />
          <Tile label="Open pull requests" value={analytics.openPulls} />
          <Tile label="Columns over WIP" value={analytics.overLimitColumns} />
        </dl>

        <Section title="Cards per column">
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Column</th>
                <th>Cards</th>
                <th>WIP limit</th>
              </tr>
            </thead>
            <tbody>
              {analytics.columns.map((column) => (
                <tr key={column.id} title={barTitle(column)}>
                  <th scope="row" className="w-28 truncate py-1.5 pr-3 text-left font-normal">
                    {column.name}
                  </th>
                  <td className="py-1.5">
                    <Bar
                      value={column.count}
                      max={maxColumn}
                      marker={column.wipLimit}
                      tone={column.overLimit ? "warning" : "primary"}
                    />
                  </td>
                  <td className="w-24 py-1.5 pl-3 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {column.overLimit && (
                        <TriangleAlert
                          className="size-3.5 text-warning"
                          aria-label="Over WIP limit"
                        />
                      )}
                      {column.count}
                      {column.wipLimit !== null && (
                        <span className="text-muted-foreground">/{column.wipLimit}</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            The tick on a bar marks the column&apos;s WIP limit.
          </p>
        </Section>

        <Section title="GitHub items">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GITHUB_STATES.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5"
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <GitHubStateBadge kind={entry.kind} state={entry.state} isDraft={entry.isDraft} />
                  <span className="text-muted-foreground">
                    {entry.kind === "issue" ? "issues" : "PRs"}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {analytics.github[entry.key] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {analytics.labels.length > 0 && (
          <Section title="Top labels">
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Label</th>
                  <th>Cards</th>
                </tr>
              </thead>
              <tbody>
                {analytics.labels.map((label) => (
                  <tr key={label.name} title={`${label.name}: ${label.count} cards`}>
                    <th scope="row" className="w-36 py-1.5 pr-3 text-left font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: `#${label.color}` }}
                        />
                        {label.name}
                      </span>
                    </th>
                    <td className="py-1.5">
                      <Bar value={label.count} max={maxLabel} tone="muted" />
                    </td>
                    <td className="w-12 py-1.5 pl-3 text-right tabular-nums">{label.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function barTitle(column: { name: string; count: number; wipLimit: number | null }) {
  return column.wipLimit === null
    ? `${column.name}: ${column.count} cards`
    : `${column.name}: ${column.count} of ${column.wipLimit} (WIP limit)`;
}

/** Thin bar anchored at the baseline with a rounded data end and an optional limit tick. */
function Bar({
  value,
  max,
  marker = null,
  tone,
}: {
  value: number;
  max: number;
  marker?: number | null;
  tone: "primary" | "warning" | "muted";
}) {
  const fill = { primary: "bg-primary", warning: "bg-warning", muted: "bg-chart-5" }[tone];
  return (
    <div aria-hidden="true" className="relative h-2.5 rounded-r-[4px] bg-muted">
      <div
        className={`${fill} h-full rounded-r-[4px] transition-[width] duration-300`}
        style={{ width: `${(value / max) * 100}%` }}
      />
      {marker !== null && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/70"
          style={{ left: `calc(${(marker / max) * 100}% - 1px)` }}
        />
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}
