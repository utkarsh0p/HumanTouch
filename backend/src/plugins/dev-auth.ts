import type { FastifyInstance, FastifyRequest } from "fastify";

import { getAuthenticatedUserFromRequest } from "../services/auth-sessions.js";
import { getUserByEmail } from "../services/users.js";
import type { AuthenticatedUser } from "../types/auth.js";

declare module "fastify" {
  interface FastifyContextConfig {
    auth?: boolean;
  }

  interface FastifyRequest {
    currentUser: AuthenticatedUser;
  }
}

async function resolveRequestUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  const sessionUser = await getAuthenticatedUserFromRequest(request);
  if (sessionUser) {
    return sessionUser;
  }

  const authHeaderValue = request.headers["x-auth-user-email"];
  const authEmail =
    typeof authHeaderValue === "string"
      ? authHeaderValue
      : Array.isArray(authHeaderValue)
        ? authHeaderValue[0]
        : null;

  if (authEmail) {
    const user = await getUserByEmail(authEmail);
    if (!user) {
      throw new Error(`Authenticated user not found for email: ${authEmail}`);
    }
    return user;
  }

  const headerValue = request.headers["x-dev-user-email"];
  const email =
    typeof headerValue === "string"
      ? headerValue
      : Array.isArray(headerValue)
        ? headerValue[0]
        : null;

  if (email) {
    const user = await getUserByEmail(email);
    if (!user) {
      throw new Error(`Dev auth user not found for email: ${email}`);
    }
    return user;
  }
  throw new Error("Authentication required.");
}

export async function devAuthPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.routeOptions.config.auth === false) {
      return;
    }

    try {
      request.currentUser = await resolveRequestUser(request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Authentication required.";
      const unauthorizedError = new Error(detail) as Error & { statusCode: number };
      unauthorizedError.statusCode = 401;
      throw unauthorizedError;
    }
  });
}
