"use client";

import type { GitHubRuleDto } from "@devsync/shared";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

import { useGitHubMutations } from "../../api/github-api";
import { useBoardStore } from "../../store/board-store";

type StateChoice = "none" | "closed" | "open";

const STATE_LABELS: Record<StateChoice, string> = {
  none: "No state change",
  closed: "Close the issue or PR",
  open: "Reopen the issue or PR",
};

const parseLabels = (value: string) =>
  value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

/** Per-column push rules. Admins edit, everyone else reads. */
export function GitHubColumnRules({ editable }: { editable: boolean }) {
  const columnOrder = useBoardStore((state) => state.columnOrder);
  const columns = useBoardStore((state) => state.columns);

  return (
    <ul className="divide-y rounded-lg border" aria-label="Column rules">
      {columnOrder.map((columnId) => {
        const column = columns[columnId];
        if (!column) return null;
        return (
          <RuleRow
            // Remount when the saved rule changes, so local edits reset.
            key={`${columnId}:${JSON.stringify(column.githubRule)}`}
            columnId={columnId}
            name={column.name}
            rule={column.githubRule}
            editable={editable}
          />
        );
      })}
    </ul>
  );
}

function describe(rule: GitHubRuleDto | null): string {
  if (!rule) return "No change";
  const parts: string[] = [];
  if (rule.state === "closed") parts.push("Close");
  if (rule.state === "open") parts.push("Reopen");
  if (rule.addLabels?.length) parts.push(`+${rule.addLabels.join(", +")}`);
  if (rule.removeLabels?.length) parts.push(`−${rule.removeLabels.join(", −")}`);
  return parts.join(" · ");
}

function RuleRow({
  columnId,
  name,
  rule,
  editable,
}: {
  columnId: string;
  name: string;
  rule: GitHubRuleDto | null;
  editable: boolean;
}) {
  const boardId = useBoardStore((state) => state.boardId);
  const { setRule } = useGitHubMutations(boardId);
  const [state, setState] = useState<StateChoice>(rule?.state ?? "none");
  const [labels, setLabels] = useState((rule?.addLabels ?? []).join(", "));

  const save = (nextState: StateChoice, nextLabels: string) => {
    const addLabels = parseLabels(nextLabels);
    const next: GitHubRuleDto = {
      ...(nextState === "none" ? {} : { state: nextState }),
      ...(addLabels.length ? { addLabels } : {}),
      ...(rule?.removeLabels?.length ? { removeLabels: rule.removeLabels } : {}),
    };
    const normalized = Object.keys(next).length ? next : null;
    if (JSON.stringify(normalized) !== JSON.stringify(rule)) {
      setRule.mutate({ columnId, rule: normalized });
    }
  };

  if (!editable) {
    return (
      <li className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">{describe(rule)}</span>
      </li>
    );
  }

  return (
    <li className="grid gap-2 px-3 py-2.5">
      <span className="text-sm font-medium">{name}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          aria-label={`GitHub state when moved to ${name}`}
          value={state}
          onChange={(event) => {
            const value = event.target.value as StateChoice;
            setState(value);
            save(value, labels);
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {(Object.keys(STATE_LABELS) as StateChoice[]).map((choice) => (
            <option key={choice} value={choice}>
              {STATE_LABELS[choice]}
            </option>
          ))}
        </select>
        <Input
          aria-label={`Labels to add when moved to ${name}`}
          placeholder="Add labels, comma separated"
          value={labels}
          onChange={(event) => setLabels(event.target.value)}
          onBlur={() => save(state, labels)}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="h-8 text-sm"
        />
      </div>
      {setRule.error && <p className="text-xs text-destructive">{setRule.error.message}</p>}
    </li>
  );
}
