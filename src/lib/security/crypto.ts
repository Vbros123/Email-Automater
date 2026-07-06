import "server-only";

import crypto from "crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

export function encryptSecret(plainText: string) {
  if (!env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is required to encrypt Gmail tokens.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted]
    .map((buffer) => buffer.toString("base64url"))
    .join(".");
}

export function decryptSecret(payload: string) {
  if (!env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is required to decrypt Gmail tokens.");
  }

  const [ivText, tagText, encryptedText] = payload.split(".");

  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Invalid encrypted payload.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getKey() {
  const raw = env.ENCRYPTION_KEY ?? "";
  const base64 = Buffer.from(raw, "base64");

  if (base64.length === 32) {
    return base64;
  }

  const hex = Buffer.from(raw, "hex");

  if (hex.length === 32) {
    return hex;
  }

  return crypto.createHash("sha256").update(raw).digest();
}
