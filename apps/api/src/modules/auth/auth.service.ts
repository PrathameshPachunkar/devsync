import { eq, users, type Database } from "@devsync/db";
import type { LoginInput, RegisterInput, SessionUserDto } from "@devsync/shared";

import { conflict, unauthorized } from "../../lib/http-error";
import { createBoard } from "../boards/boards.service";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./passwords";

type UserRow = typeof users.$inferSelect;

export function toSessionUser(row: UserRow): SessionUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    githubLogin: row.githubLogin,
    isGuest: row.isGuest,
  };
}

export async function getUser(db: Database, userId: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  // A valid token for a deleted user: treat as signed out.
  if (!row) throw unauthorized("unauthenticated", "Account no longer exists");
  return row;
}

export async function registerUser(db: Database, input: RegisterInput): Promise<UserRow> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email));
  if (existing) throw conflict("email_taken", "An account with that email already exists");

  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    })
    .onConflictDoNothing()
    .returning();
  // Lost a race with a concurrent signup for the same email.
  if (!user) throw conflict("email_taken", "An account with that email already exists");

  await createBoard(db, user.id, {
    name: "My first board",
    description: "Drag cards between columns, or add your own.",
    accent: null,
  });
  return user;
}

export async function loginUser(db: Database, input: LoginInput): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email));
  const valid = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyAgainstDummy(input.password);
  // One message for both cases, so the API never confirms an email exists.
  if (!user || !valid) throw unauthorized("invalid_credentials", "Email or password is incorrect");
  return user;
}
