import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP's minimum recommended parameters (19 MiB, 2 passes).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Burns the same CPU as a real check when the account does not exist, so
 * response timing does not reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("devsync-timing-equalizer");
  await verifyPassword(await dummyHash, password);
  return false;
}
