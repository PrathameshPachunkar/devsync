import { z } from "zod";

import { CARD_TITLE_MAX_LENGTH, COLUMN_NAME_MAX_LENGTH } from "./board";
import { BOARD_ROLES } from "./permissions";

/**
 * Request validation shared by the API (which enforces it) and the web forms
 * (which give instant feedback with the same rules).
 */

const name = z.string().trim().min(1, "Required").max(80);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");

export const registerSchema = z.object({
  name,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Not length-checked on login, so old passwords never get locked out.
  password: z.string().min(1, "Required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const accentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), id: z.string().min(1).max(32) }),
  z.object({ kind: z.literal("custom"), hue: z.number().min(0).max(360) }),
]);

export const createBoardSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  description: z.string().trim().max(280).default(""),
  accent: accentSchema.nullable().default(null),
});
export type CreateBoardBody = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = createBoardSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateBoardBody = z.infer<typeof updateBoardSchema>;

const id = z.uuid();
const nullableId = id.nullable();
const columnName = z.string().trim().min(1, "Required").max(COLUMN_NAME_MAX_LENGTH);
const cardTitle = z.string().trim().min(1, "Required").max(CARD_TITLE_MAX_LENGTH);

export const createColumnSchema = z.object({
  /** Optional client id, so optimistic UI and server agree on identity. */
  id: id.optional(),
  name: columnName,
});

export const renameColumnSchema = z.object({ name: columnName });

export const moveColumnSchema = z.object({
  prevColumnId: nullableId,
  nextColumnId: nullableId,
});

export const createCardSchema = z.object({
  id: id.optional(),
  columnId: id,
  title: cardTitle,
});

export const updateCardSchema = z
  .object({
    title: cardTitle.optional(),
    description: z.string().max(10_000).nullable().optional(),
  })
  .refine((value) => value.title !== undefined || value.description !== undefined, {
    message: "Nothing to update",
  });

export const moveCardSchema = z.object({
  toColumnId: id,
  prevCardId: nullableId,
  nextCardId: nullableId,
});

export const boardRoleSchema = z.enum(BOARD_ROLES);

export const addMemberSchema = z.object({
  email: emailSchema,
  role: boardRoleSchema,
});

export const updateMemberSchema = z.object({ role: boardRoleSchema });
