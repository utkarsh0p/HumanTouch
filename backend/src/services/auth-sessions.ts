import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../db/prisma.js";
import { getUserById } from "./users.js";
import type { AuthenticatedUser } from "../types/auth.js";

const AUTH_COOKIE_NAME = "humantouch_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

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

  await prisma.authSession.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
    },
  });

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

  const tokenHash = hashToken(token);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
  });
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await revokeAuthSessionByToken(token);
    return null;
  }

  await prisma.authSession.update({
    where: { tokenHash },
    data: { lastSeenAt: new Date() },
  });

  return await getUserById(session.userId);
}

export async function revokeAuthSessionByToken(token: string): Promise<void> {
  await prisma.authSession.deleteMany({
    where: { tokenHash: hashToken(token) },
  });
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
