import { createHash, randomBytes } from "node:crypto";

/** Opaque session token handed to the browser. Only its hash is persisted. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}
