"use client";

import { COLUMN_NAME_MAX_LENGTH } from "@devsync/shared";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateColumn } from "../api/use-board-mutations";
import { useBoardStore } from "../store/board-store";

export function AddColumn() {
  const boardId = useBoardStore((state) => state.boardId);
  const { mutate: createColumn } = useCreateColumn();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");

  const close = () => {
    setName("");
    setIsOpen(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    createColumn({ boardId, columnId: crypto.randomUUID(), name: value });
    close();
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        className="h-10 w-72 shrink-0 justify-start rounded-xl bg-column/60 text-column-foreground hover:bg-column"
        onClick={() => setIsOpen(true)}
      >
        <Plus data-icon="inline-start" />
        Add column
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="grid w-72 shrink-0 gap-2 rounded-xl bg-column p-2">
      <Input
        autoFocus
        value={name}
        maxLength={COLUMN_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && close()}
        placeholder="Column name"
        aria-label="New column name"
        className="bg-task"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name.trim()}>
          Add column
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
