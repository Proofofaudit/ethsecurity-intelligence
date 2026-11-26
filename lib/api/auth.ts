import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./http";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Moderator authentication: `Authorization: Bearer <MODERATOR_TOKEN>`. While MODERATOR_TOKEN is
 * unset the moderation endpoints do not exist (404). Comparison is constant-time over SHA-256
 * digests so token length is not leaked either.
 */
export function requireModerator(req: Request): void {
  const token = process.env.MODERATOR_TOKEN;
  if (!token) throw new ApiError(404, "not_found", "Not found");
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const ok = !!m?.[1] && timingSafeEqual(digest(m[1]), digest(token));
  if (!ok) throw new ApiError(401, "unauthorized", "A valid moderator token is required");
}
