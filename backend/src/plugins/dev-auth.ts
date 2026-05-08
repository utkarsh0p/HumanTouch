import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";

import { getDefaultDevUser, getUserByEmail } from "../services/users.js";
import type { AuthenticatedUser } from "../types/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: AuthenticatedUser;
  }
}

async function resolveRequestUser(request: FastifyRequest): Promise<AuthenticatedUser> {
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

  const defaultUser = await getDefaultDevUser();
  if (!defaultUser) {
    throw new Error("No default dev auth user is available.");
  }

  return defaultUser;
}

export const devAuthPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook("preHandler", async (request) => {
    request.currentUser = await resolveRequestUser(request);
  });
};
