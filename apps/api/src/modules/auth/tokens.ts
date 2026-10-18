import { createHash, randomBytes } from "node:crypto";

import { errors as joseErrors, jwtVerify, SignJWT } from "jose";

import { unauthorized } from "../../lib/http-error";

const ISSUER = "devsync-api";
const AUDIENCE = "devsync";

export interface AccessTokenService {
  sign(userId: string): Promise<string>;
  /** Returns the user id, or throws a 401 HttpError. */
  verify(token: string): Promise<string>;
  ttlSeconds: number;
}

/** Short-lived HS256 access tokens. Stateless, so no database hit per request. */
export function createAccessTokenService(secret: string, ttlSeconds: number): AccessTokenService {
  const key = new TextEncoder().encode(secret);

  return {
    ttlSeconds,
    sign: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key),
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ["HS256"],
        });
        if (!payload.sub) throw unauthorized("invalid_token", "Invalid access token");
        return payload.sub;
      } catch (error) {
        if (error instanceof joseErrors.JWTExpired) {
          throw unauthorized("token_expired", "Access token expired");
        }
        throw unauthorized("invalid_token", "Invalid access token");
      }
    },
  };
}

/** Opaque refresh token: 256 bits of randomness. Only its hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
