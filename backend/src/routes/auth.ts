import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import {
  clearAuthCookie,
  createAuthSession,
  getAuthenticatedUserFromRequest,
  revokeAuthSessionFromRequest,
  setAuthCookie,
} from "../services/auth-sessions.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import {
  createLocalUser,
  getUserByEmail,
  getUserByEmailWithPasswordHash,
  resolveOrCreateGoogleUser,
} from "../services/users.js";

const signupSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  full_name: z.string().trim().min(1),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const nextAuthSyncSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  name: z.string().trim().optional().nullable(),
  provider: z.literal("google"),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/auth/me",
    {
      config: {
        auth: false,
      },
    },
    async (request) => {
      const sessionUser = await getAuthenticatedUserFromRequest(request);
      if (sessionUser) {
        return { user: sessionUser };
      }

      const nextAuthEmailHeader = request.headers["x-auth-user-email"];
      const nextAuthEmail =
        typeof nextAuthEmailHeader === "string"
          ? nextAuthEmailHeader
          : Array.isArray(nextAuthEmailHeader)
            ? nextAuthEmailHeader[0]
            : null;

      if (nextAuthEmail) {
        return { user: await getUserByEmail(nextAuthEmail) };
      }

      const headerValue = request.headers["x-dev-user-email"];
      const email =
        typeof headerValue === "string"
          ? headerValue
          : Array.isArray(headerValue)
            ? headerValue[0]
            : null;

      if (!email) {
        return { user: null };
      }

      return { user: await getUserByEmail(email) };
    },
  );

  app.post(
    "/api/auth/nextauth/sync",
    {
      config: {
        auth: false,
      },
    },
    async (request, reply) => {
      if (settings.authSecret) {
        const syncSecret = request.headers["x-nextauth-sync-secret"];
        if (syncSecret !== settings.authSecret) {
          reply.code(401);
          return { detail: "Invalid auth sync secret." };
        }
      }

      const payload = nextAuthSyncSchema.parse(request.body);
      const user = await resolveOrCreateGoogleUser({
        email: payload.email,
        full_name: payload.name,
      });

      return { user };
    },
  );

  app.post(
    "/api/auth/signup",
    {
      config: {
        auth: false,
      },
    },
    async (request, reply) => {
      const payload = signupSchema.parse(request.body);
      const existingUser = await getUserByEmail(payload.email);
      if (existingUser) {
        reply.code(409);
        return { detail: "Email is already in use." };
      }

      const user = await createLocalUser({
        email: payload.email,
        full_name: payload.full_name,
        password_hash: hashPassword(payload.password),
      });

      const token = await createAuthSession(user.id);
      setAuthCookie(reply, token);

      reply.code(201);
      return { user };
    },
  );

  app.post(
    "/api/auth/login",
    {
      config: {
        auth: false,
      },
    },
    async (request, reply) => {
      const payload = loginSchema.parse(request.body);
      const user = await getUserByEmailWithPasswordHash(payload.email);
      if (!user?.password_hash || !verifyPassword(payload.password, user.password_hash)) {
        reply.code(401);
        return { detail: "Invalid email or password." };
      }

      const token = await createAuthSession(user.id);
      setAuthCookie(reply, token);

      return {
        user: {
          id: user.id,
          company_id: user.company_id,
          email: user.email,
          full_name: user.full_name,
          role_key: user.role_key,
          is_admin: user.is_admin,
        },
      };
    },
  );

  app.post(
    "/api/auth/logout",
    {
      config: {
        auth: false,
      },
    },
    async (request, reply) => {
      await revokeAuthSessionFromRequest(request);
      clearAuthCookie(reply);
      return { success: true };
    },
  );
}
