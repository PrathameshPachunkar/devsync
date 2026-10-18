"use client";

import { CARD_TITLE_MAX_LENGTH } from "@devsync/shared";
import { Plus } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useCreateCard } from "../api/use-board-mutations";
import { useBoardStore } from "../store/board-store";

/** Inline "add card" form. Stays open after submitting for rapid entry. */
export function AddCardComposer({
  columnId,
  columnName,
}: {
  columnId: string;
  columnName: string;
}) {
  const boardId = useBoardStore((state) => state.boardId);
  const { mutate: createCard } = useCreateCard();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = title.trim();
    if (!value) return;
    createCard({ boardId, columnId, cardId: crypto.randomUUID(), title: value });
    setTitle("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) submit(event);
    if (event.key === "Escape") {
      setTitle("");
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mx-2 mb-2 justify-start text-column-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Plus data-icon="inline-start" />
        Add card
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-2 px-2 pb-2">
      <Textarea
        autoFocus
        value={title}
        maxLength={CARD_TITLE_MAX_LENGTH}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Card title"
        aria-label={`New card title in ${columnName}`}
        rows={2}
        className="min-h-0 resize-none bg-task text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim()}>
          Add card
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setTitle("");
            setIsOpen(false);
          }}
        >
          Done
        </Button>
      </div>
    </form>
  );
}
