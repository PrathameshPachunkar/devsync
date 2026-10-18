"use client";

import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { memo } from "react";

import { trackRender } from "@/lib/perf/render-tracker";

import { BoardDndContext } from "../dnd/board-dnd-context";
import { useBoardPermission } from "../hooks/use-board-permission";
import { useBoardStore } from "../store/board-store";
import { AddColumn } from "./add-column";
import { SortableBoardColumn } from "./board-column";

/**
 * Subscribes only to the column order. Memoized because its parent
 * re-renders on every cache sync, and that must not cascade down here.
 */
export const BoardCanvas = memo(function BoardCanvas() {
  trackRender("BoardCanvas");
  const columnOrder = useBoardStore((state) => state.columnOrder);
  const canCreateColumn = useBoardPermission("column:create");

  return (
    <BoardDndContext>
      <div
        role="region"
        aria-label="Board columns"
        className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4 sm:p-6"
      >
        <SortableContext items={columnOrder as string[]} strategy={horizontalListSortingStrategy}>
          {columnOrder.map((columnId) => (
            <SortableBoardColumn key={columnId} columnId={columnId} />
          ))}
        </SortableContext>
        {canCreateColumn && <AddColumn />}
      </div>
    </BoardDndContext>
  );
});
