"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { lazy, memo, Suspense, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useRenameColumn } from "../api/use-board-mutations";
import { useBoardPermission } from "../hooks/use-board-permission";
import type { ColumnView } from "../model/normalize";
import { useBoardStore } from "../store/board-store";

const DeleteColumnDialog = lazy(() =>
  import("./delete-column-dialog").then((m) => ({ default: m.DeleteColumnDialog })),
);

export interface ColumnDragHandle {
  setRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

interface ColumnHeaderProps {
  column: ColumnView;
  dragHandle: ColumnDragHandle | null;
}

/** Memoized: re-renders only when the column or its drag handle changes. */
export const ColumnHeader = memo(function ColumnHeader({ column, dragHandle }: ColumnHeaderProps) {
  const boardId = useBoardStore((state) => state.boardId);
  const canRename = useBoardPermission("column:rename");
  const canDelete = useBoardPermission("column:delete");
  const { mutate: renameColumn } = useRenameColumn();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Set when Rename is chosen from the menu. The menu would otherwise return
  // focus to its trigger on close, blurring the rename input and committing
  // the edit before the user types.
  const focusRenameOnMenuClose = useRef(false);

  const count = column.cardIds.length;
  const overLimit = column.wipLimit !== null && count > column.wipLimit;

  const commitRename = (value: string) => {
    setIsEditing(false);
    const name = value.trim();
    if (name && name !== column.name) renameColumn({ boardId, columnId: column.id, name });
  };

  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commitRename(event.currentTarget.value);
    if (event.key === "Escape") setIsEditing(false);
  };

  return (
    <header className="flex items-center gap-1 px-2 pt-2 pb-1">
      {dragHandle && (
        <button
          ref={dragHandle.setRef}
          type="button"
          {...dragHandle.attributes}
          {...dragHandle.listeners}
          aria-label={`Reorder column ${column.name}`}
          className="-ml-0.5 flex size-6 cursor-grab touch-manipulation items-center justify-center rounded-md text-column-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
      )}

      {isEditing ? (
        <Input
          ref={renameInputRef}
          autoFocus
          defaultValue={column.name}
          maxLength={60}
          aria-label="Column name"
          onBlur={(event) => commitRename(event.currentTarget.value)}
          onKeyDown={onRenameKeyDown}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <h2
          className="min-w-0 flex-1 truncate px-1 text-xs font-semibold tracking-wide text-column-foreground uppercase"
          onDoubleClick={canRename ? () => setIsEditing(true) : undefined}
        >
          {column.name}
        </h2>
      )}

      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          overLimit ? "bg-warning/15 font-semibold text-warning" : "text-column-foreground",
        )}
        title={
          column.wipLimit === null
            ? `${count} cards`
            : `${count} of ${column.wipLimit} WIP limit${overLimit ? " (over limit)" : ""}`
        }
      >
        {column.wipLimit === null ? count : `${count}/${column.wipLimit}`}
      </span>

      {(canRename || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${column.name} column actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!focusRenameOnMenuClose.current) return;
              focusRenameOnMenuClose.current = false;
              event.preventDefault();
              renameInputRef.current?.focus();
              renameInputRef.current?.select();
            }}
          >
            {canRename && (
              <DropdownMenuItem
                onSelect={() => {
                  focusRenameOnMenuClose.current = true;
                  setIsEditing(true);
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
            )}
            {canRename && canDelete && <DropdownMenuSeparator />}
            {canDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                <Trash2 />
                Delete column
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isDeleteOpen && (
        <Suspense fallback={null}>
          <DeleteColumnDialog column={column} onClose={() => setIsDeleteOpen(false)} />
        </Suspense>
      )}
    </header>
  );
});
