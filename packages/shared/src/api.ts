import type { AccentDto, LinkedRepoDto } from "./board";
import type { BoardRole } from "./permissions";

/** Wire types for auth, board lists, and membership. */

export interface SessionUserDto {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
  /** Demo sandbox account created by "Try the demo". */
  isGuest: boolean;
}

export interface AuthProvidersDto {
  password: true;
  github: boolean;
  demo: boolean;
}

export interface BoardSummaryDto {
  id: string;
  name: string;
  description: string;
  accent: AccentDto | null;
  repo: LinkedRepoDto | null;
  role: BoardRole;
  columnCount: number;
  /** Cards outside the board's last column. */
  openCardCount: number;
  memberCount: number;
}

export interface BoardMemberDto {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: BoardRole;
}

/** Every API error has this shape. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
