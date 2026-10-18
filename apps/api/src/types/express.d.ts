import type { BoardRole } from "@devsync/shared";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`. */
      auth?: { userId: string };
      /** Set by `requireBoardPermission`. */
      boardAccess?: { boardId: string; role: BoardRole };
    }
  }
}

export {};
