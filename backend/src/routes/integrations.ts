import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import {
  disconnectGoogleAccount,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  listConnectedAccounts,
  saveGoogleConnectedAccount,
} from "../services/integrations.js";

const GOOGLE_OAUTH_STATE_COOKIE = "humantouch_google_oauth_state";

const callbackQuerySchema = z.object({
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

function buildExpiredStateCookieValue(): string {
  const segments = [
    `${GOOGLE_OAUTH_STATE_COOKIE}=`,
    "Path=/api/integrations/google",
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

function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    settings.googleOAuth.clientId &&
      settings.googleOAuth.clientSecret &&
      settings.googleOAuth.redirectUri &&
      settings.tokenEncryptionKey,
  );
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

function redirectToFrontend(reply: FastifyReply, params: Record<string, string>): void {
  const url = new URL(settings.frontendBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  reply.redirect(url.toString());
}

export async function registerIntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/integrations", async (request) => {
    const accounts = await listConnectedAccounts(request.currentUser);
    return {
      providers: {
        google: {
          configured: isGoogleOAuthConfigured(),
          scopes: settings.googleOAuth.scopes,
        },
      },
      accounts,
    };
  });

  app.get("/api/integrations/google/connect", async (_request, reply) => {
    reply.redirect("/api/auth/google/start");
  });

  app.get(
    "/api/integrations/google/callback",
    async (request: FastifyRequest, reply) => {
      reply.header("Set-Cookie", buildExpiredStateCookieValue());
      const query = callbackQuerySchema.parse(request.query);

      if (query.error) {
        redirectToFrontend(reply, {
          integration: "google",
          integration_status: "error",
          integration_detail: query.error,
        });
        return;
      }

      const cookies = parseCookies(request.headers.cookie);
      if (!query.state || cookies[GOOGLE_OAUTH_STATE_COOKIE] !== query.state) {
        redirectToFrontend(reply, {
          integration: "google",
          integration_status: "error",
          integration_detail: "invalid_state",
        });
        return;
      }

      if (!query.code) {
        redirectToFrontend(reply, {
          integration: "google",
          integration_status: "error",
          integration_detail: "missing_code",
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
        await saveGoogleConnectedAccount({
          user: request.currentUser,
          tokenResponse,
          googleUser,
        });

        redirectToFrontend(reply, {
          integration: "google",
          integration_status: "connected",
        });
      } catch (error) {
        request.log.error({ error }, "Google OAuth callback failed.");
        redirectToFrontend(reply, {
          integration: "google",
          integration_status: "error",
          integration_detail: "callback_failed",
        });
      }
    },
  );

  app.post("/api/integrations/google/disconnect", async (request) => {
    await disconnectGoogleAccount(request.currentUser);
    return { success: true };
  });
}
