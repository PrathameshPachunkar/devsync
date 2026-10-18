"use client";

import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useMemo } from "react";

import { trackRender } from "@/lib/perf/render-tracker";
import { cn } from "@/lib/utils";

import type { DragData } from "../dnd/drag-data";
import { useBoardPermission } from "../hooks/use-board-permission";
import type { ColumnView } from "../model/normalize";
import { useBoardStore } from "../store/board-store";
import { AddCardComposer } from "./add-card-composer";
import { ColumnHeader, type ColumnDragHandle } from "./column-header";
import { SortableTaskCard, TaskCardBody } from "./task-card";

/**
 * Card list for one column. Memoized on the ColumnView object, which keeps
 * its identity until this column's name, limit, or card order changes.
 */
const ColumnCardList = memo(function ColumnCardList({
  column,
  disabled,
}: {
  column: ColumnView;
  disabled: boolean;
}) {
  trackRender("ColumnCardList");
  return (
    <SortableContext
      id={column.id} // dnd-kit types items as mutable. It never mutates them.
      items={column.cardIds as string[]}
      strategy={verticalListSortingStrategy}
    >
      <ol
        aria-label={`${column.name} cards`}
        className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-1 pb-2"
      >
        {column.cardIds.map((cardId) => (
          <SortableTaskCard key={cardId} cardId={cardId} columnId={column.id} disabled={disabled} />
        ))}
        {column.cardIds.length === 0 && (
          <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-xs text-column-foreground/70">
            {disabled ? "No cards" : "Drop cards here"}
          </li>
        )}
      </ol>
    </SortableContext>
  );
});

export const SortableBoardColumn = memo(function SortableBoardColumn({
  columnId,
}: {
  columnId: string;
}) {
  const column = useBoardStore((state) => state.columns[columnId]);
  const canReorder = useBoardPermission("column:reorder");
  const canMoveCards = useBoardPermission("card:move");
  const canCreateCards = useBoardPermission("card:create");
  const data = useMemo<DragData>(() => ({ type: "column" }), []);
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnId, data, disabled: !canReorder });

  const dragHandle = useMemo<ColumnDragHandle | null>(
    () => (canReorder ? { setRef: setActivatorNodeRef, attributes, listeners } : null),
    [canReorder, setActivatorNodeRef, attributes, listeners],
  );

  if (!column) return null;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`${column.name} column`}
      data-testid="board-column"
      className={cn(
        "flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-column",
        isDragging && "opacity-40",
      )}
    >
      <ColumnHeader column={column} dragHandle={dragHandle} />
      <ColumnCardList column={column} disabled={!canMoveCards} />
      {canCreateCards && <AddCardComposer columnId={column.id} columnName={column.name} />}
    </section>
  );
});

/** Lightweight column snapshot for <DragOverlay>. Only the first cards are drawn. */
export function ColumnOverlay({ columnId }: { columnId: string }) {
  const column = useBoardStore((state) => state.columns[columnId]);
  const cards = useBoardStore((state) => state.cards);
  if (!column) return null;
  return (
    <div className="flex max-h-[70vh] w-72 rotate-1 cursor-grabbing flex-col gap-2 overflow-hidden rounded-xl bg-column p-2 shadow-2xl ring-2 ring-primary/40">
      <div className="px-1 py-1 text-xs font-semibold tracking-wide text-column-foreground uppercase">
        {column.name} · {column.cardIds.length}
      </div>
      {column.cardIds.slice(0, 6).map((id) => {
        const card = cards[id];
        return card ? <TaskCardBody key={id} card={card} /> : null;
      })}
    </div>
  );
}
