"use client";

import type { CardDto, ChecksStatus } from "@devsync/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  CircleCheck,
  CircleDashed,
  CircleX,
  GitBranch,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo, type KeyboardEvent } from "react";

import { GitHubStateBadge } from "@/components/github/github-state-badge";
import { trackRender } from "@/lib/perf/render-tracker";
import { cn } from "@/lib/utils";

import type { DragData } from "../dnd/drag-data";
import { preloadTaskDetails } from "../lazy";
import { useBoardActions, useBoardStore } from "../store/board-store";

const dueFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const CHECKS: Readonly<
  Record<ChecksStatus, { icon: LucideIcon; label: string; className: string }>
> = {
  success: { icon: CircleCheck, label: "Checks passing", className: "text-success" },
  failure: { icon: CircleX, label: "Checks failing", className: "text-destructive" },
  pending: { icon: CircleDashed, label: "Checks running", className: "text-warning" },
};

function initials(name: string): string {
  const [first = "", last = ""] = name.split(" ");
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Presentational card. Memoized on the card object, which keeps its identity
 * until that card changes, so drag events, syncs, and edits elsewhere skip it.
 * It renders plain DOM only: no Radix primitives or portals per card.
 */
export const TaskCardBody = memo(function TaskCardBody({
  card,
  className,
}: {
  card: CardDto;
  className?: string;
}) {
  trackRender("TaskCardBody");
  const gh = card.github;
  const checks = gh?.checksStatus ? CHECKS[gh.checksStatus] : null;
  // DevSync assignees first. Synced cards fall back to GitHub assignees.
  const people = card.assignees.length
    ? card.assignees.map((a) => ({ key: a.id, name: a.name, avatarUrl: a.avatarUrl }))
    : (gh?.assignees ?? []).map((a) => ({
        key: a.login,
        name: `@${a.login}`,
        avatarUrl: a.avatarUrl,
      }));
  const visibleAssignees = people.slice(0, 3);

  return (
    <article
      className={cn(
        "grid gap-2 rounded-lg border border-task-border bg-task p-3 text-left text-task-foreground shadow-xs",
        className,
      )}
    >
      {gh && (
        <div className="flex items-center gap-2">
          <GitHubStateBadge kind={gh.kind} state={gh.state} isDraft={gh.isDraft} />
          <span className="ml-auto font-mono text-xs text-muted-foreground">#{gh.number}</span>
        </div>
      )}

      <h3 className="line-clamp-3 text-sm leading-snug font-medium">{card.title}</h3>

      {card.labels.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Labels">
          {card.labels.map((label) => (
            <li
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: `#${label.color}` }}
              />
              {label.name}
            </li>
          ))}
        </ul>
      )}

      {gh?.headRef && (
        <p className="flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground">
          <GitBranch className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{gh.headRef}</span>
        </p>
      )}

      {(visibleAssignees.length > 0 || checks || card.dueDate || card.commentCount > 0) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {visibleAssignees.length > 0 && (
            <span className="flex -space-x-1">
              <span className="sr-only">Assigned to {people.map((a) => a.name).join(", ")}</span>
              {visibleAssignees.map((user) =>
                user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 24px external avatar; next/image adds nothing here
                  <img
                    key={user.key}
                    src={user.avatarUrl}
                    alt=""
                    title={user.name}
                    width={24}
                    height={24}
                    loading="lazy"
                    decoding="async"
                    className="size-6 rounded-full bg-secondary ring-2 ring-task"
                  />
                ) : (
                  <span
                    key={user.key}
                    aria-hidden="true"
                    title={user.name}
                    className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground ring-2 ring-task"
                  >
                    {initials(user.name.replace(/^@/, ""))}
                  </span>
                ),
              )}
            </span>
          )}
          {checks && (
            <span className={cn("flex items-center", checks.className)} title={checks.label}>
              <checks.icon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{checks.label}</span>
            </span>
          )}
          {card.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" aria-hidden="true" />
              <span className="sr-only">Due</span>
              {dueFormatter.format(new Date(card.dueDate))}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="ml-auto flex items-center gap-1">
              <MessageSquare className="size-3" aria-hidden="true" />
              {card.commentCount}
              <span className="sr-only">comments</span>
            </span>
          )}
        </div>
      )}
    </article>
  );
});

interface SortableTaskCardProps {
  cardId: string;
  columnId: string;
  disabled: boolean;
}

/**
 * Thin sortable shell around the memoized body. useSortable re-renders on
 * drag events, which is cheap here because the body skips re-rendering.
 */
export const SortableTaskCard = memo(function SortableTaskCard({
  cardId,
  columnId,
  disabled,
}: SortableTaskCardProps) {
  const card = useBoardStore((state) => state.cards[cardId]);
  const { openCard } = useBoardActions();
  const data = useMemo<DragData>(() => ({ type: "card", columnId }), [columnId]);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cardId, data, disabled });

  if (!card) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Space picks the card up (keyboard sensor). Enter opens it.
    if (event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      openCard(cardId);
      return;
    }
    listeners?.onKeyDown?.(event);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("list-none", isDragging && "opacity-40")}
    >
      <div
        ref={setActivatorNodeRef}
        {...(disabled ? {} : attributes)}
        {...listeners}
        role="button"
        tabIndex={0}
        aria-label={`${card.title}. Open details`}
        onKeyDown={onKeyDown}
        onClick={() => openCard(cardId)}
        onPointerEnter={preloadTaskDetails}
        onFocus={preloadTaskDetails}
        data-testid="task-card"
        className={cn(
          "rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          disabled ? "cursor-pointer" : "cursor-grab touch-manipulation active:cursor-grabbing",
        )}
      >
        <TaskCardBody card={card} />
      </div>
    </li>
  );
});

/** Rendered inside <DragOverlay>, following the pointer. */
export function TaskCardOverlay({ cardId }: { cardId: string }) {
  const card = useBoardStore((state) => state.cards[cardId]);
  if (!card) return null;
  return (
    <TaskCardBody
      card={card}
      className="w-[17rem] rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40"
    />
  );
}
