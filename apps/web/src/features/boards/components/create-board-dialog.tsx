"use client";

import { createBoardSchema } from "@devsync/shared";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { useCreateBoard } from "../api";

export function CreateBoardDialog() {
  const router = useRouter();
  const createBoard = useCreateBoard();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = createBoardSchema.safeParse({
      name: form.get("name"),
      description: form.get("description"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setError(null);
    createBoard.mutate(parsed.data, {
      onSuccess: (board) => {
        setOpen(false);
        router.push(`/boards/${board.id}`);
      },
      onError: (err) => setError(err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          New board
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
            <DialogDescription>
              It starts with To do, In progress, and Done columns.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="board-name">Name</Label>
            <Input id="board-name" name="name" maxLength={80} autoFocus required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="board-description">Description</Label>
            <Textarea id="board-description" name="description" maxLength={280} rows={2} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={createBoard.isPending}>
              {createBoard.isPending ? "Creating…" : "Create board"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
