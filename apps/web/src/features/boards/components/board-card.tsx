import { Columns3, ListTodo, Users } from "lucide-react";
import Link from "next/link";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Badge } from "@/components/ui/badge";
import { accentScopeProps, parseAccentSetting } from "@/lib/theme/accents";

import { BOARD_ROLE_LABELS, type BoardSummaryDto } from "@devsync/shared";

/** Board tile. It wears the board's own accent via scoped CSS variables. */
export function BoardCard({ board }: { board: BoardSummaryDto }) {
  const accent = parseAccentSetting(board.accent);
  return (
    <Link
      href={`/boards/${board.id}`}
      {...(accent ? accentScopeProps(accent) : {})}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-xl border bg-card p-5 text-card-foreground transition-[border-color,box-shadow] outline-none hover:border-primary/50 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-primary" />
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="truncate font-semibold group-hover:text-primary">{board.name}</h2>
          <p className="line-clamp-2 text-sm text-muted-foreground">{board.description}</p>
        </div>
        <Badge variant="secondary">{BOARD_ROLE_LABELS[board.role]}</Badge>
      </div>

      <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Stat
          icon={<ListTodo className="size-3.5" />}
          label="Open cards"
          value={board.openCardCount}
        />
        <Stat icon={<Columns3 className="size-3.5" />} label="Columns" value={board.columnCount} />
        <Stat icon={<Users className="size-3.5" />} label="Members" value={board.memberCount} />
        {board.repo && (
          <div className="flex min-w-0 items-center gap-1">
            <dt className="sr-only">Linked repository</dt>
            <GitHubIcon className="size-3.5 shrink-0" />
            <dd className="truncate font-mono">
              {board.repo.owner}/{board.repo.name}
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <dt className="flex items-center">
        <span aria-hidden="true">{icon}</span>
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
