"use client";

import {
  addMemberSchema,
  BOARD_ROLE_LABELS,
  BOARD_ROLES,
  type BoardMemberDto,
  type BoardRole,
} from "@devsync/shared";
import { Loader2, UserMinus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/hooks";
import { useBoardMembers, useMemberMutations } from "@/features/boards/api";
import { cn } from "@/lib/utils";

import { useBoardAccentScope } from "../../hooks/use-board-accent-scope";
import { useBoardPermission } from "../../hooks/use-board-permission";
import { useBoardStore } from "../../store/board-store";

const ROLE_HINTS: Record<BoardRole, string> = {
  ADMIN: "Everything, including members and settings",
  MAINTAINER: "Create, edit, and move cards and columns",
  VIEWER: "Read-only",
};

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  label,
}: {
  id: string;
  value: BoardRole;
  onChange: (role: BoardRole) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as BoardRole)}
      className={selectClass}
    >
      {BOARD_ROLES.map((role) => (
        <option key={role} value={role}>
          {BOARD_ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

/** Lazy-loaded. Everyone can see who is on the board. Admins can change it. */
export function MembersDialog({ onClose }: { onClose: () => void }) {
  const boardId = useBoardStore((state) => state.boardId);
  const canManage = useBoardPermission("member:manage");
  const accentScope = useBoardAccentScope();
  const { data: me } = useSession();
  const { data: members, isPending } = useBoardMembers(boardId);
  const { add, update, remove } = useMemberMutations(boardId);
  const [role, setRole] = useState<BoardRole>("MAINTAINER");
  const [error, setError] = useState<string | null>(null);

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = addMemberSchema.safeParse({ email: new FormData(form).get("email"), role });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the email");
    setError(null);
    add.mutate(parsed.data, {
      onSuccess: () => form.reset(),
      onError: (err) => setError(err.message),
    });
  };

  const onRowError = (err: Error) => setError(err.message);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...accentScope} className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>
            {canManage
              ? "Invite people by the email they signed up with, and choose what they can do."
              : "People on this board and their roles."}
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <form onSubmit={invite} className="grid gap-2" noValidate>
            <Label htmlFor="member-email">Invite by email</Label>
            <div className="flex gap-2">
              <Input
                id="member-email"
                name="email"
                type="email"
                placeholder="teammate@example.com"
                className="flex-1"
              />
              <RoleSelect
                id="member-role"
                label="Role for new member"
                value={role}
                onChange={setRole}
              />
              <Button type="submit" disabled={add.isPending}>
                {add.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Invite
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
          </form>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {isPending ? (
          <div className="flex justify-center py-6">
            <Loader2
              className="size-5 animate-spin text-muted-foreground"
              aria-label="Loading members"
            />
          </div>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Board members">
            {members?.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                isMe={member.userId === me?.id}
                canManage={canManage}
                onRoleChange={(next) =>
                  update.mutate({ userId: member.userId, role: next }, { onError: onRowError })
                }
                onRemove={() => remove.mutate(member.userId, { onError: onRowError })}
                busy={update.isPending || remove.isPending}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  member,
  isMe,
  canManage,
  onRoleChange,
  onRemove,
  busy,
}: {
  member: BoardMemberDto;
  isMe: boolean;
  canManage: boolean;
  onRoleChange: (role: BoardRole) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const initials = member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Avatar className="size-8">
        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">
          {member.name}
          {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
        </span>
        {member.email && (
          <span className="truncate text-xs text-muted-foreground">{member.email}</span>
        )}
      </div>
      {canManage ? (
        <>
          <RoleSelect
            id={`role-${member.userId}`}
            label={`Role for ${member.name}`}
            value={member.role}
            onChange={onRoleChange}
            disabled={busy}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${member.name}`}
            onClick={onRemove}
            disabled={busy || isMe}
            className={cn(isMe && "invisible")}
          >
            <UserMinus />
          </Button>
        </>
      ) : (
        <Badge variant="secondary">{BOARD_ROLE_LABELS[member.role]}</Badge>
      )}
    </li>
  );
}
