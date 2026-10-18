import type { BoardView } from "../../model/normalize";

export interface BoardAnalytics {
  totalCards: number;
  linkedPercent: number;
  openPulls: number;
  overLimitColumns: number;
  columns: {
    id: string;
    name: string;
    count: number;
    wipLimit: number | null;
    overLimit: boolean;
  }[];
  /** Keyed issue-open, issue-closed, pr-draft, pr-open, pr-merged, pr-closed. */
  github: Record<string, number>;
  labels: { name: string; color: string; count: number }[];
}

const TOP_LABELS = 6;

export function computeBoardAnalytics(view: BoardView): BoardAnalytics {
  const cards = Object.values(view.cards);
  const github: Record<string, number> = {};
  const labels = new Map<string, { name: string; color: string; count: number }>();
  let linked = 0;

  for (const card of cards) {
    for (const label of card.labels) {
      const entry = labels.get(label.name) ?? { name: label.name, color: label.color, count: 0 };
      entry.count += 1;
      labels.set(label.name, entry);
    }
    const gh = card.github;
    if (!gh) continue;
    linked += 1;
    const key =
      gh.kind === "issue"
        ? `issue-${gh.state === "open" ? "open" : "closed"}`
        : gh.state === "open" && gh.isDraft
          ? "pr-draft"
          : `pr-${gh.state}`;
    github[key] = (github[key] ?? 0) + 1;
  }

  const columns = view.columnOrder.flatMap((id) => {
    const column = view.columns[id];
    if (!column) return [];
    const count = column.cardIds.length;
    const overLimit = column.wipLimit !== null && count > column.wipLimit;
    return [{ id, name: column.name, count, wipLimit: column.wipLimit, overLimit }];
  });

  return {
    totalCards: cards.length,
    linkedPercent: cards.length === 0 ? 0 : Math.round((linked / cards.length) * 100),
    openPulls: (github["pr-open"] ?? 0) + (github["pr-draft"] ?? 0),
    overLimitColumns: columns.filter((c) => c.overLimit).length,
    columns,
    github,
    labels: [...labels.values()].sort((a, b) => b.count - a.count).slice(0, TOP_LABELS),
  };
}
