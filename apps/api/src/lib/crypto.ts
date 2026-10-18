import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored in the database, such as GitHub
 * personal access tokens. GCM authenticates the ciphertext, so a tampered
 * value fails to decrypt instead of producing garbage.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.
 */
export interface SecretBox {
  encrypt(plaintext: string): string;
  decrypt(sealed: string): string;
}

/** Accepts a base64 32-byte key. Any other string is hashed into one (dev fallback). */
function deriveKey(material: string): Buffer {
  const decoded = Buffer.from(material, "base64");
  if (decoded.length === 32 && !material.startsWith("dev:")) return decoded;
  return createHash("sha256").update(`devsync-token-key:${material}`).digest();
}

export function createSecretBox(keyMaterial: string): SecretBox {
  const key = deriveKey(keyMaterial);
  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ["v1", iv, tag, ciphertext]
        .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
        .join(".");
    },
    decrypt(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split(".");
      if (version !== "v1" || !iv || !tag || !ciphertext)
        throw new Error("Unsupported secret format");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
