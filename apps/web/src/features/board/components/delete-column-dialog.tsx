"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useDeleteColumn } from "../api/use-board-mutations";
import type { ColumnView } from "../model/normalize";
import { useBoardStore } from "../store/board-store";

export function DeleteColumnDialog({
  column,
  onClose,
}: {
  column: ColumnView;
  onClose: () => void;
}) {
  const boardId = useBoardStore((state) => state.boardId);
  const { mutate: deleteColumn } = useDeleteColumn();
  const count = column.cardIds.length;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{column.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 0
              ? "The column is empty. This can't be undone."
              : `Its ${count} ${count === 1 ? "card" : "cards"} will be deleted too. This can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              deleteColumn({ boardId, columnId: column.id });
              onClose();
            }}
          >
            Delete column
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
