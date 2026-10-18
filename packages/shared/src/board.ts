import type { BoardRole } from "./permissions";

/**
 * Wire format (DTOs) shared by the API and the web app. Timestamps are ISO
 * strings, and GitHub ids stay strings because they can exceed 2^53.
 */

export type AccentDto = { kind: "preset"; id: string } | { kind: "custom"; hue: number };

export interface UserRefDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface LabelDto {
  id: string;
  name: string;
  /** Six-digit hex without "#", as GitHub returns it. */
  color: string;
}

export type GitHubItemKind = "issue" | "pull_request";
export type GitHubItemState = "open" | "closed" | "merged";
export type ChecksStatus = "pending" | "success" | "failure";

export interface GitHubItemDto {
  kind: GitHubItemKind;
  number: number;
  state: GitHubItemState;
  isDraft: boolean;
  htmlUrl: string;
  /** "owner/name" */
  repo: string;
  headRef: string | null;
  checksStatus: ChecksStatus | null;
  /** GitHub users need not be DevSync users, so this is login + avatar only. */
  assignees: { login: string; avatarUrl: string | null }[];
}

export interface ColumnDto {
  id: string;
  boardId: string;
  name: string;
  position: string;
  wipLimit: number | null;
}

export interface CardDto {
  id: string;
  boardId: string;
  columnId: string;
  position: string;
  title: string;
  description: string | null;
  labels: LabelDto[];
  assignees: UserRefDto[];
  commentCount: number;
  dueDate: string | null;
  github: GitHubItemDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedRepoDto {
  owner: string;
  name: string;
}

export interface BoardDto {
  id: string;
  name: string;
  description: string;
  accent: AccentDto | null;
  repo: LinkedRepoDto | null;
  /** The caller's role on this board. */
  role: BoardRole;
  /** Incremented on every structural change. Clients refetch on a gap. */
  version: number;
  columns: ColumnDto[];
  cards: CardDto[];
}

/* ---------------------------------------------------------------- inputs */

export interface CreateColumnInput {
  boardId: string;
  /** Client-generated id so optimistic UI and server agree on identity. */
  columnId: string;
  name: string;
}

export interface RenameColumnInput {
  boardId: string;
  columnId: string;
  name: string;
}

export interface MoveColumnInput {
  boardId: string;
  columnId: string;
  prevColumnId: string | null;
  nextColumnId: string | null;
}

export interface DeleteColumnInput {
  boardId: string;
  columnId: string;
}

export interface CreateCardInput {
  boardId: string;
  cardId: string;
  columnId: string;
  title: string;
}

export interface MoveCardInput {
  boardId: string;
  cardId: string;
  toColumnId: string;
  prevCardId: string | null;
  nextCardId: string | null;
}

export interface UpdateCardInput {
  boardId: string;
  cardId: string;
  title?: string;
  description?: string | null;
}

export interface DeleteCardInput {
  boardId: string;
  cardId: string;
}

export const COLUMN_NAME_MAX_LENGTH = 60;
export const CARD_TITLE_MAX_LENGTH = 200;
