import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { settings } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getEncryptionKey(): Buffer {
  if (!settings.tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required for OAuth token storage.");
  }

  return createHash("sha256").update(settings.tokenEncryptionKey).digest();
}

export function encryptToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken) {
    return null;
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext] = encryptedToken.split(":");
  if (
    version !== VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext
  ) {
    throw new Error("Unsupported encrypted token format.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
