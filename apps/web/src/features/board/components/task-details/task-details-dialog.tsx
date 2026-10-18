"use client";

import { CARD_TITLE_MAX_LENGTH, type CardDto } from "@devsync/shared";
import { CalendarDays, ExternalLink, GitBranch, Trash2 } from "lucide-react";
import { useState } from "react";

import { GitHubStateBadge } from "@/components/github/github-state-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { useDeleteCard, useUpdateCard } from "../../api/use-board-mutations";
import { useBoardAccentScope } from "../../hooks/use-board-accent-scope";
import { useBoardPermission } from "../../hooks/use-board-permission";
import { findColumnOfCard } from "../../model/normalize";
import { useBoardStore } from "../../store/board-store";

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Lazy-loaded: this chunk is fetched on first open, or on card hover/focus. */
export function TaskDetailsDialog({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const card = useBoardStore((state) => state.cards[cardId]);
  const columnName = useBoardStore((state) => {
    const columnId = findColumnOfCard(state, cardId);
    return columnId ? state.columns[columnId]?.name : undefined;
  });
  const accentScope = useBoardAccentScope();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...accentScope} className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {card ? (
          <CardDetails card={card} columnName={columnName ?? "Unknown column"} onClose={onClose} />
        ) : (
          <DialogHeader>
            <DialogTitle>Card not found</DialogTitle>
            <DialogDescription>It may have been deleted by someone else.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CardDetails({
  card,
  columnName,
  onClose,
}: {
  card: CardDto;
  columnName: string;
  onClose: () => void;
}) {
  const canEdit = useBoardPermission("card:edit");
  const canDelete = useBoardPermission("card:delete");
  const { mutate: updateCard } = useUpdateCard();
  const { mutate: deleteCard } = useDeleteCard();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const gh = card.github;

  const saveTitle = () => {
    const value = title.trim();
    if (!value) return setTitle(card.title);
    if (value !== card.title) updateCard({ boardId: card.boardId, cardId: card.id, title: value });
  };

  const saveDescription = () => {
    const value = description.trim() || null;
    if (value !== card.description) {
      updateCard({ boardId: card.boardId, cardId: card.id, description: value });
    }
  };

  return (
    <>
      <DialogHeader className="gap-3 pr-8">
        {gh && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <GitHubStateBadge kind={gh.kind} state={gh.state} isDraft={gh.isDraft} />
            <a
              href={gh.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {gh.repo}#{gh.number}
              <ExternalLink className="size-3" aria-hidden="true" />
              <span className="sr-only">(opens GitHub)</span>
            </a>
          </div>
        )}
        <DialogTitle className={canEdit ? "sr-only" : "text-lg leading-snug"}>
          {card.title}
        </DialogTitle>
        <DialogDescription>
          In <span className="font-medium text-foreground">{columnName}</span> · Created{" "}
          {dateFormatter.format(new Date(card.createdAt))}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[1fr_13rem]">
        <div className="grid content-start gap-4">
          {canEdit && (
            <div className="grid gap-2">
              <Label htmlFor="card-title">Title</Label>
              <Textarea
                id="card-title"
                value={title}
                maxLength={CARD_TITLE_MAX_LENGTH}
                rows={2}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                className="min-h-0 resize-none text-base font-medium"
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="card-description">Description</Label>
            {canEdit ? (
              <Textarea
                id="card-description"
                value={description}
                rows={6}
                placeholder="Add more detail…"
                onChange={(event) => setDescription(event.target.value)}
                onBlur={saveDescription}
              />
            ) : (
              <p
                id="card-description"
                className="text-sm whitespace-pre-wrap text-muted-foreground"
              >
                {card.description ?? "No description."}
              </p>
            )}
          </div>
        </div>

        <dl className="grid content-start gap-4 text-sm">
          <MetaRow label="Labels">
            {card.labels.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {card.labels.map((label) => (
                  <li
                    key={label.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
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
          </MetaRow>
          <MetaRow label="Assignees">
            {card.assignees.length === 0 ? (
              <span className="text-muted-foreground">Unassigned</span>
            ) : (
              <ul className="grid gap-1">
                {card.assignees.map((user) => (
                  <li key={user.id}>{user.name}</li>
                ))}
              </ul>
            )}
          </MetaRow>
          {card.dueDate && (
            <MetaRow label="Due">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {dateFormatter.format(new Date(card.dueDate))}
              </span>
            </MetaRow>
          )}
          {gh?.headRef && (
            <MetaRow label="Branch">
              <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs">
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{gh.headRef}</span>
              </span>
            </MetaRow>
          )}
          {gh?.checksStatus && (
            <MetaRow label="Checks">
              <span className="capitalize">{gh.checksStatus}</span>
            </MetaRow>
          )}
        </dl>
      </div>

      {canDelete && (
        <DialogFooter className="sm:justify-start">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Delete this card permanently?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteCard({ boardId: card.boardId, cardId: card.id });
                  onClose();
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 data-icon="inline-start" />
              Delete card
            </Button>
          )}
        </DialogFooter>
      )}
    </>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
