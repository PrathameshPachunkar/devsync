import { and, boardMembers, count, eq, users, type Database, type Transaction } from "@devsync/db";
import type { BoardMemberDto, BoardRole } from "@devsync/shared";

import { conflict, notFound } from "../../lib/http-error";

const ROLE_ORDER: Record<BoardRole, number> = { ADMIN: 0, MAINTAINER: 1, VIEWER: 2 };

export async function listMembers(db: Database, boardId: string): Promise<BoardMemberDto[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: boardMembers.role,
    })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId));
  return rows.sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
  );
}

export async function addMember(
  db: Database,
  boardId: string,
  input: { email: string; role: BoardRole },
): Promise<BoardMemberDto> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email));
  if (!user) throw notFound("user_not_found", "No DevSync account uses that email");
  const inserted = await db
    .insert(boardMembers)
    .values({ boardId, userId: user.id, role: input.role })
    .onConflictDoNothing()
    .returning({ role: boardMembers.role });
  if (inserted.length === 0)
    throw conflict("already_member", "That person is already on this board");
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: input.role,
  };
}

/**
 * Removing or demoting the last admin would leave a board nobody can manage.
 * The check runs under a lock on the board's admin rows, so two concurrent
 * demotions cannot both pass it.
 */
async function assertNotLastAdmin(tx: Transaction, boardId: string, userId: string) {
  const [target] = await tx
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .for("update");
  if (!target) throw notFound("member_not_found", "That person is not on this board");
  if (target.role !== "ADMIN") return;

  await tx
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.role, "ADMIN")))
    .for("update");
  const [{ admins } = { admins: 0 }] = await tx
    .select({ admins: count() })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.role, "ADMIN")));
  if (Number(admins) <= 1) throw conflict("last_admin", "A board needs at least one admin");
}

export function updateMemberRole(
  db: Database,
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<BoardMemberDto> {
  return db.transaction(async (tx) => {
    if (role !== "ADMIN") await assertNotLastAdmin(tx, boardId, userId);
    const updated = await tx
      .update(boardMembers)
      .set({ role })
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
      .returning({ role: boardMembers.role });
    if (updated.length === 0)
      throw notFound("member_not_found", "That person is not on this board");
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    return {
      userId,
      name: user!.name,
      email: user!.email,
      avatarUrl: user!.avatarUrl,
      role,
    };
  });
}

export function removeMember(db: Database, boardId: string, userId: string): Promise<void> {
  return db.transaction(async (tx) => {
    await assertNotLastAdmin(tx, boardId, userId);
    await tx
      .delete(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)));
  });
}
