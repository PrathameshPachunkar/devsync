import { randomUUID } from "node:crypto";

import { and, eq, isNull, refreshTokens, type Database } from "@devsync/db";

import type { AppConfig } from "../../config";
import { unauthorized } from "../../lib/http-error";
import { generateRefreshToken, hashToken, type AccessTokenService } from "./tokens";

export interface IssuedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Two concurrent refreshes, say from two tabs, both present the same token.
 * The loser sees it as revoked. Inside this window that is treated as a
 * benign race and the family is not revoked.
 */
const ROTATION_GRACE_MS = 15_000;

export interface SessionService {
  issue(userId: string, userAgent?: string, familyId?: string): Promise<IssuedSession>;
  rotate(refreshToken: string, userAgent?: string): Promise<IssuedSession>;
  revoke(refreshToken: string): Promise<void>;
}

export function createSessionService(
  db: Database,
  config: AppConfig,
  accessTokens: AccessTokenService,
): SessionService {
  const ttlMs = config.refreshTokenTtlDays * 86_400_000;

  async function insertToken(
    executor: Pick<Database, "insert">,
    userId: string,
    familyId: string,
    userAgent?: string,
  ) {
    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    const [row] = await executor
      .insert(refreshTokens)
      .values({
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: userAgent?.slice(0, 256) ?? null,
      })
      .returning({ id: refreshTokens.id });
    return { token, expiresAt, id: row!.id };
  }

  return {
    async issue(userId, userAgent, familyId = randomUUID()) {
      const { token, expiresAt } = await insertToken(db, userId, familyId, userAgent);
      return {
        userId,
        accessToken: await accessTokens.sign(userId),
        refreshToken: token,
        refreshExpiresAt: expiresAt,
      };
    },

    async rotate(presented, userAgent) {
      const outcome = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, hashToken(presented)))
          .for("update");

        if (!current) return { kind: "invalid" as const };

        if (current.revokedAt) {
          const age = Date.now() - current.revokedAt.getTime();
          if (current.replacedById && age < ROTATION_GRACE_MS) return { kind: "raced" as const };
          // A rotated token came back: assume it was stolen. Kill the family.
          await tx
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(
              and(eq(refreshTokens.familyId, current.familyId), isNull(refreshTokens.revokedAt)),
            );
          return { kind: "reused" as const };
        }

        if (current.expiresAt.getTime() <= Date.now()) return { kind: "expired" as const };

        const next = await insertToken(tx, current.userId, current.familyId, userAgent);
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date(), replacedById: next.id })
          .where(eq(refreshTokens.id, current.id));
        return { kind: "rotated" as const, userId: current.userId, next };
      });

      switch (outcome.kind) {
        case "rotated":
          return {
            userId: outcome.userId,
            accessToken: await accessTokens.sign(outcome.userId),
            refreshToken: outcome.next.token,
            refreshExpiresAt: outcome.next.expiresAt,
          };
        case "raced":
          throw unauthorized("token_rotated", "Session was refreshed in another request");
        case "reused":
          throw unauthorized("token_reused", "Session revoked. Please sign in again");
        case "expired":
          throw unauthorized("session_expired", "Session expired. Please sign in again");
        case "invalid":
          throw unauthorized("invalid_refresh_token", "Please sign in again");
      }
    },

    async revoke(presented) {
      const [row] = await db
        .select({ familyId: refreshTokens.familyId })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(presented)));
      if (!row) return;
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
    },
  };
}
