import type {
  AccentDto,
  ChecksStatus,
  GitHubAuthMode,
  GitHubItemKind,
  GitHubItemState,
  GitHubRuleDto,
  GitHubSyncStatus,
} from "@devsync/shared";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Fractional-index sort key. Byte-order collation is required: base62 keys
 * sort by character code, and locale collations would compare "a" and "A"
 * as neighbors and scramble the order.
 */
const sortKey = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const boardRole = pgEnum("board_role", ["ADMIN", "MAINTAINER", "VIEWER"]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lowercased. Null for GitHub accounts without a public email and for guests. */
    email: text("email"),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    githubUserId: bigint("github_user_id", { mode: "number" }),
    githubLogin: text("github_login"),
    /** Demo sandbox accounts. Safe to purge after they expire. */
    isGuest: boolean("is_guest").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_github_user_id_key").on(t.githubUserId),
  ],
);

/**
 * Refresh tokens are opaque random strings. Only a SHA-256 hash is stored.
 * Every rotation stays in the same family, so reuse of a rotated token
 * revokes the whole family, which logs out a thief and the victim alike.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("refresh_tokens_token_hash_key").on(t.tokenHash),
    index("refresh_tokens_user_id_idx").on(t.userId),
    index("refresh_tokens_family_id_idx").on(t.familyId),
  ],
);

/* ----------------------------------------------------------------- boards */

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  accent: jsonb("accent").$type<AccentDto>(),
  /** Bumped by every write. The UPDATE that bumps it also serializes writers. */
  version: integer("version").notNull().default(0),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const boardMembers = pgTable(
  "board_members",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: boardRole("role").notNull().default("VIEWER"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.userId] }),
    index("board_members_user_id_idx").on(t.userId),
  ],
);

export const columns = pgTable(
  "columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: sortKey("position").notNull(),
    wipLimit: integer("wip_limit"),
    /** What moving a linked card here does on GitHub. */
    githubRule: jsonb("github_rule").$type<GitHubRuleDto>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("columns_board_id_position_key").on(t.boardId, t.position)],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalized so a board loads, and RBAC checks, in one query. */
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    position: sortKey("position").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    commentCount: integer("comment_count").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cards_column_id_position_key").on(t.columnId, t.position),
    index("cards_board_id_idx").on(t.boardId),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [uniqueIndex("labels_board_id_name_key").on(t.boardId, t.name)],
);

export const cardLabels = pgTable(
  "card_labels",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.labelId] })],
);

export const cardAssignees = pgTable(
  "card_assignees",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.userId] })],
);

/* ----------------------------------------------------------------- GitHub */

/** The repository linked to a board, and how the API talks to it. */
export const boardRepos = pgTable(
  "board_repos",
  {
    boardId: uuid("board_id")
      .primaryKey()
      .references(() => boards.id, { onDelete: "cascade" }),
    /** Canonical "owner" and "name" as GitHub reports them. */
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    githubRepoId: bigint("github_repo_id", { mode: "number" }),
    authMode: text("auth_mode").$type<GitHubAuthMode>().notNull().default("public"),
    installationId: bigint("installation_id", { mode: "number" }),
    /** AES-256-GCM ciphertext of a personal access token. Never returned by the API. */
    encryptedToken: text("encrypted_token"),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    webhookId: bigint("webhook_id", { mode: "number" }),
    syncStatus: text("sync_status").$type<GitHubSyncStatus>().notNull().default("idle"),
    syncStartedAt: timestamp("sync_started_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /**
     * Newest updated_at GitHub has returned. The next sync asks for changes
     * since this, so it never depends on agreement between our clock and GitHub's.
     */
    syncCursor: timestamp("sync_cursor", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("board_repos_github_repo_id_idx").on(t.githubRepoId),
    index("board_repos_owner_name_idx").on(t.owner, t.name),
  ],
);

/** Mirror of the GitHub issue or pull request behind a card. */
export const githubItems = pgTable(
  "github_items",
  {
    cardId: uuid("card_id")
      .primaryKey()
      .references(() => cards.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    kind: text("kind").$type<GitHubItemKind>().notNull(),
    number: integer("number").notNull(),
    state: text("state").$type<GitHubItemState>().notNull(),
    isDraft: boolean("is_draft").notNull().default(false),
    htmlUrl: text("html_url").notNull(),
    /** "owner/name" */
    repo: text("repo").notNull(),
    headRef: text("head_ref"),
    headSha: text("head_sha"),
    checksStatus: text("checks_status").$type<ChecksStatus>(),
    assignees: jsonb("assignees")
      .$type<{ login: string; avatarUrl: string | null }[]>()
      .notNull()
      .default([]),
    /** GitHub's updated_at. Older webhook payloads are ignored. */
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("github_items_board_repo_number_key").on(t.boardId, t.repo, t.number),
    index("github_items_repo_number_idx").on(t.repo, t.number),
    index("github_items_head_sha_idx").on(t.headSha),
  ],
);

/** Items whose card was deleted on purpose, so syncs don't bring them back. */
export const githubIgnored = pgTable(
  "github_ignored",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    repo: text("repo").notNull(),
    number: integer("number").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.repo, t.number] })],
);

/** Webhook delivery ids already handled. GitHub retries, so handling must be idempotent. */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  repo: text("repo"),
  receivedAt: createdAt(),
});

export type OutboxPayload = {
  repo: string;
  number: number;
  rule: GitHubRuleDto;
};

/**
 * Transactional outbox for pushes to GitHub. A card move writes its row in
 * the same transaction as the move, so a GitHub outage can never lose the
 * change or roll back the board. A worker delivers rows with retry and backoff.
 */
export const githubOutbox = pgTable(
  "github_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<OutboxPayload>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("github_outbox_due_idx").on(t.completedAt, t.failedAt, t.nextAttemptAt),
    index("github_outbox_board_id_idx").on(t.boardId),
  ],
);
