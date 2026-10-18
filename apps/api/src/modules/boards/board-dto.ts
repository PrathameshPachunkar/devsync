import {
  boardRepos,
  boards,
  cardAssignees,
  cardLabels,
  cards,
  columns,
  eq,
  githubItems,
  labels,
  users,
  type DbOrTx,
} from "@devsync/db";
import type {
  BoardDto,
  BoardRole,
  CardDto,
  ColumnDto,
  GitHubItemDto,
  LabelDto,
  UserRefDto,
} from "@devsync/shared";

import { notFound } from "../../lib/http-error";

type ColumnRow = typeof columns.$inferSelect;
type CardRow = typeof cards.$inferSelect;
type GitHubRow = typeof githubItems.$inferSelect;

export function toColumnDto(row: ColumnRow): ColumnDto {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    position: row.position,
    wipLimit: row.wipLimit,
    githubRule: row.githubRule ?? null,
  };
}

function toGitHubDto(row: GitHubRow): GitHubItemDto {
  return {
    kind: row.kind,
    number: row.number,
    state: row.state,
    isDraft: row.isDraft,
    htmlUrl: row.htmlUrl,
    repo: row.repo,
    headRef: row.headRef,
    checksStatus: row.checksStatus,
    assignees: row.assignees,
  };
}

function toCardDto(
  row: CardRow,
  related: {
    labels: Map<string, LabelDto[]>;
    assignees: Map<string, UserRefDto[]>;
    github: Map<string, GitHubRow>;
  },
): CardDto {
  const gh = related.github.get(row.id);
  return {
    id: row.id,
    boardId: row.boardId,
    columnId: row.columnId,
    position: row.position,
    title: row.title,
    description: row.description,
    labels: related.labels.get(row.id) ?? [],
    assignees: related.assignees.get(row.id) ?? [],
    commentCount: row.commentCount,
    dueDate: row.dueDate?.toISOString() ?? null,
    github: gh ? toGitHubDto(gh) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function groupBy<T, V>(rows: T[], key: (row: T) => string, value: (row: T) => V) {
  const map = new Map<string, V[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(value(row));
    else map.set(key(row), [value(row)]);
  }
  return map;
}

/** Labels, assignees, and GitHub data for the cards matched by `where`. */
async function loadCardRelations(db: DbOrTx, where: { boardId: string } | { cardId: string }) {
  const labelFilter =
    "cardId" in where ? eq(cardLabels.cardId, where.cardId) : eq(labels.boardId, where.boardId);
  const cardFilter =
    "cardId" in where ? eq(cards.id, where.cardId) : eq(cards.boardId, where.boardId);

  const [labelRows, assigneeRows, githubRows] = await Promise.all([
    db
      .select({ cardId: cardLabels.cardId, id: labels.id, name: labels.name, color: labels.color })
      .from(cardLabels)
      .innerJoin(labels, eq(labels.id, cardLabels.labelId))
      .where(labelFilter)
      .orderBy(labels.name),
    db
      .select({
        cardId: cardAssignees.cardId,
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(cardAssignees)
      .innerJoin(users, eq(users.id, cardAssignees.userId))
      .innerJoin(cards, eq(cards.id, cardAssignees.cardId))
      .where(cardFilter)
      .orderBy(users.name),
    db
      .select({ item: githubItems })
      .from(githubItems)
      .innerJoin(cards, eq(cards.id, githubItems.cardId))
      .where(cardFilter),
  ]);

  return {
    labels: groupBy(
      labelRows,
      (r) => r.cardId,
      (r) => ({ id: r.id, name: r.name, color: r.color }),
    ),
    assignees: groupBy(
      assigneeRows,
      (r) => r.cardId,
      (r) => ({ id: r.id, name: r.name, avatarUrl: r.avatarUrl }),
    ),
    github: new Map(githubRows.map((r) => [r.item.cardId, r.item])),
  };
}

export async function loadCardDto(db: DbOrTx, cardId: string): Promise<CardDto> {
  const [row] = await db.select().from(cards).where(eq(cards.id, cardId));
  if (!row) throw notFound("card_not_found", "Card not found");
  return toCardDto(row, await loadCardRelations(db, { cardId }));
}

/** The full board in a fixed number of queries, no matter how many cards it has. */
export async function loadBoardDto(
  db: DbOrTx,
  boardId: string,
  role: BoardRole,
): Promise<BoardDto> {
  const [[board], [repo], columnRows, cardRows, related] = await Promise.all([
    db.select().from(boards).where(eq(boards.id, boardId)),
    db.select().from(boardRepos).where(eq(boardRepos.boardId, boardId)),
    db.select().from(columns).where(eq(columns.boardId, boardId)).orderBy(columns.position),
    db.select().from(cards).where(eq(cards.boardId, boardId)).orderBy(cards.position),
    loadCardRelations(db, { boardId }),
  ]);
  if (!board) throw notFound("board_not_found", "Board not found");

  return {
    id: board.id,
    name: board.name,
    description: board.description,
    accent: board.accent ?? null,
    repo: repo ? { owner: repo.owner, name: repo.name, demo: repo.authMode === "demo" } : null,
    role,
    version: board.version,
    columns: columnRows.map(toColumnDto),
    cards: cardRows.map((row) => toCardDto(row, related)),
  };
}
