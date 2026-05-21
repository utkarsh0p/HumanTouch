import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import {
  clearAuthCookie,
  createAuthSession,
  getAuthenticatedUserFromRequest,
  revokeAuthSessionFromRequest,
  setAuthCookie,
} from "../services/auth-sessions.js";
import {
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  saveGoogleConnectedAccount,
} from "../services/integrations.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import {
  createGoogleUser,
  createLocalUser,
  getUserByEmail,
  getUserByEmailWithPasswordHash,
  markUserGoogleAuthenticated,
} from "../services/users.js";

const GOOGLE_OAUTH_STATE_COOKIE = "humantouch_google_auth_state";
const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const signupSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  full_name: z.string().trim().min(1),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const googleCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

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

function buildGoogleStateCookieValue(state: string): string {
  const segments = [
    `${GOOGLE_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}`,
    "Path=/api/auth/google",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
  ];

  if (process.env.NODE_ENV === "production") {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function buildExpiredGoogleStateCookieValue(): string {
  const segments = [
    `${GOOGLE_OAUTH_STATE_COOKIE}=`,
    "Path=/api/auth/google",
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

function requireGoogleOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
} {
  if (!settings.googleOAuth.clientId || !settings.googleOAuth.clientSecret) {
    throw new Error("Google OAuth client id and secret are not configured.");
  }
  if (!settings.tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  }

  return {
    clientId: settings.googleOAuth.clientId,
    clientSecret: settings.googleOAuth.clientSecret,
    redirectUri: settings.googleOAuth.redirectUri,
    scopes: settings.googleOAuth.scopes,
  };
}

function isGoogleOAuthConfigured(): boolean {
  return getMissingGoogleOAuthConfig().length === 0;
}

function getMissingGoogleOAuthConfig(): string[] {
  const missing: string[] = [];
  if (!settings.googleOAuth.clientId) {
    missing.push("GOOGLE_OAUTH_CLIENT_ID");
  }
  if (!settings.googleOAuth.clientSecret) {
    missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  }
  if (!settings.googleOAuth.redirectUri) {
    missing.push("GOOGLE_OAUTH_REDIRECT_URI");
  }
  if (!settings.tokenEncryptionKey) {
    missing.push("TOKEN_ENCRYPTION_KEY");
  }
  return missing;
}

function redirectToFrontend(reply: FastifyReply, params: Record<string, string>): void {
  const url = new URL(settings.frontendBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  reply.redirect(url.toString());
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/auth/providers",
    {
      config: {
        auth: false,
      },
    },
    async () => {
      return {
        google: {
          configured: isGoogleOAuthConfigured(),
          missing: getMissingGoogleOAuthConfig(),
          scopes: settings.googleOAuth.scopes,
        },
      };
    },
  );

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

  app.get(
    "/api/auth/google/start",
    {
      config: {
        auth: false,
      },
    },
    async (_request, reply) => {
      let config: ReturnType<typeof requireGoogleOAuthConfig>;
      try {
        config = requireGoogleOAuthConfig();
      } catch (error) {
        redirectToFrontend(reply, {
          auth: "google",
          auth_status: "error",
          auth_detail:
            error instanceof Error ? error.message : "Google OAuth is not configured.",
        });
        return;
      }

      const state = randomBytes(32).toString("base64url");
      const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
      authorizationUrl.searchParams.set("client_id", config.clientId);
      authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("access_type", "offline");
      authorizationUrl.searchParams.set("prompt", "consent");
      authorizationUrl.searchParams.set("include_granted_scopes", "true");

      reply.header("Set-Cookie", buildGoogleStateCookieValue(state));
      reply.redirect(authorizationUrl.toString());
    },
  );

  app.get(
    "/api/auth/google/callback",
    {
      config: {
        auth: false,
      },
    },
    async (request: FastifyRequest, reply) => {
      reply.header("Set-Cookie", buildExpiredGoogleStateCookieValue());
      const query = googleCallbackQuerySchema.parse(request.query);

      if (query.error) {
        redirectToFrontend(reply, {
          auth: "google",
          auth_status: "error",
          auth_detail: query.error,
        });
        return;
      }

      const cookies = parseCookies(request.headers.cookie);
      if (!query.state || cookies[GOOGLE_OAUTH_STATE_COOKIE] !== query.state) {
        redirectToFrontend(reply, {
          auth: "google",
          auth_status: "error",
          auth_detail: "invalid_state",
        });
        return;
      }

      if (!query.code) {
        redirectToFrontend(reply, {
          auth: "google",
          auth_status: "error",
          auth_detail: "missing_code",
        });
        return;
      }

      try {
        const config = requireGoogleOAuthConfig();
        const tokenResponse = await exchangeGoogleAuthorizationCode({
          code: query.code,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri: config.redirectUri,
        });
        if (!tokenResponse.access_token) {
          throw new Error("Google did not return an access token.");
        }

        const googleUser = await fetchGoogleUserInfo(tokenResponse.access_token);
        if (!googleUser.email) {
          throw new Error("Google profile did not include an email.");
        }

        const normalizedEmail = googleUser.email.toLowerCase();
        const existingUser = await getUserByEmail(normalizedEmail);
        const user = existingUser
          ? await markUserGoogleAuthenticated(existingUser.id)
          : await createGoogleUser({
              email: normalizedEmail,
              full_name: googleUser.name?.trim() || normalizedEmail.split("@")[0] || normalizedEmail,
            });

        await saveGoogleConnectedAccount({
          user,
          tokenResponse,
          googleUser,
        });

        const token = await createAuthSession(user.id);
        setAuthCookie(reply, token);
        redirectToFrontend(reply, {
          auth: "google",
          auth_status: "signed_in",
        });
      } catch (error) {
        request.log.error({ error }, "Google auth callback failed.");
        redirectToFrontend(reply, {
          auth: "google",
          auth_status: "error",
          auth_detail: "callback_failed",
        });
      }
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
