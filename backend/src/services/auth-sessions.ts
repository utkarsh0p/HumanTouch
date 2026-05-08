import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

import { settings } from "../config.js";
import { query } from "../db/postgres.js";
import { getUserById } from "./users.js";
import type { AuthenticatedUser } from "../types/auth.js";

const appSchema = `"${settings.appSchema.replaceAll('"', '""')}"`;
const authSessionsTable = `${appSchema}.auth_sessions`;

const AUTH_COOKIE_NAME = "humantouch_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

type AuthSessionRow = {
  user_id: string;
  expires_at: Date;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(";").reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) {
      return cookies;
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function buildCookieValue(token: string, expiresAt: Date): string {
  const segments = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];

  if (process.env.NODE_ENV === "production") {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function buildExpiredCookieValue(): string {
  const segments = [
    `${AUTH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];

  if (process.env.NODE_ENV === "production") {
    segments.push("Secure");
  }

  return segments.join("; ");
}

export async function createAuthSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query(
    `INSERT INTO ${authSessionsTable}
     (id, user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [randomUUID(), userId, tokenHash, expiresAt],
  );

  return token;
}

export async function getAuthenticatedUserFromRequest(
  request: FastifyRequest,
): Promise<AuthenticatedUser | null> {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [session] = await query<AuthSessionRow>(
    `SELECT user_id, expires_at
     FROM ${authSessionsTable}
     WHERE token_hash = $1`,
    [hashToken(token)],
  );
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await revokeAuthSessionByToken(token);
    return null;
  }

  await query(
    `UPDATE ${authSessionsTable}
     SET last_seen_at = NOW()
     WHERE token_hash = $1`,
    [hashToken(token)],
  );

  return await getUserById(session.user_id);
}

export async function revokeAuthSessionByToken(token: string): Promise<void> {
  await query(`DELETE FROM ${authSessionsTable} WHERE token_hash = $1`, [hashToken(token)]);
}

export async function revokeAuthSessionFromRequest(request: FastifyRequest): Promise<void> {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    return;
  }

  await revokeAuthSessionByToken(token);
}

export function setAuthCookie(reply: FastifyReply, token: string): void {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  reply.header("Set-Cookie", buildCookieValue(token, expiresAt));
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.header("Set-Cookie", buildExpiredCookieValue());
}
