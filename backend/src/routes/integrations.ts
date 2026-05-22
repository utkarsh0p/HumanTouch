import { randomBytes } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import {
  disconnectConnectedAccount,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  listConnectedAccounts,
  saveGoogleConnectedAccount,
} from "../services/integrations.js";
import { getUserById } from "../services/users.js";

const OAUTH_STATE_COOKIE = "humantouch_integration_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

const providerSchema = z.enum(["google", "linkedin", "meta"]);
type ProviderKey = z.infer<typeof providerSchema>;

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

function buildStateCookieValue(provider: ProviderKey, state: string, userId: string): string {
  const segments = [
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(`${provider}:${state}:${userId}`)}`,
    "Path=/api/integrations",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
  ];

  if (process.env.NODE_ENV === "production") {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function buildExpiredStateCookieValue(): string {
  const segments = [
    `${OAUTH_STATE_COOKIE}=`,
    "Path=/api/integrations",
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

function providerConfig(provider: ProviderKey): {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
} {
  if (provider === "google") {
    return settings.googleOAuth;
  }
  if (provider === "linkedin") {
    return settings.linkedinOAuth;
  }
  return settings.metaOAuth;
}

function missingProviderConfig(provider: ProviderKey): string[] {
  const config = providerConfig(provider);
  const missing: string[] = [];

  if (!config.clientId) {
    missing.push(
      provider === "google"
        ? "AUTH_GOOGLE_ID"
        : provider === "linkedin"
          ? "LINKEDIN_CLIENT_ID"
          : "META_CLIENT_ID",
    );
  }
  if (!config.clientSecret) {
    missing.push(
      provider === "google"
        ? "AUTH_GOOGLE_SECRET"
        : provider === "linkedin"
          ? "LINKEDIN_CLIENT_SECRET"
          : "META_CLIENT_SECRET",
    );
  }
  if (!config.redirectUri) {
    missing.push(`${provider.toUpperCase()}_REDIRECT_URI`);
  }
  if (!settings.tokenEncryptionKey) {
    missing.push("TOKEN_ENCRYPTION_KEY");
  }

  return missing;
}

function isProviderConfigured(provider: ProviderKey): boolean {
  return missingProviderConfig(provider).length === 0;
}

function redirectToFrontend(reply: FastifyReply, params: Record<string, string>): void {
  const url = new URL(settings.frontendBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  reply.redirect(url.toString());
}

function buildGoogleAuthorizationUrl(state: string): string {
  const config = providerConfig("google");
  if (!config.clientId || !config.clientSecret || !settings.tokenEncryptionKey) {
    throw new Error("Google OAuth is not configured.");
  }

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  return authorizationUrl.toString();
}

function buildProviderSummaries() {
  return {
    google: {
      configured: isProviderConfigured("google"),
      missing: missingProviderConfig("google"),
      scopes: settings.googleOAuth.scopes,
    },
    linkedin: {
      configured: isProviderConfigured("linkedin"),
      missing: missingProviderConfig("linkedin"),
      scopes: settings.linkedinOAuth.scopes,
    },
    meta: {
      configured: isProviderConfigured("meta"),
      missing: missingProviderConfig("meta"),
      scopes: settings.metaOAuth.scopes,
    },
  };
}

export async function registerIntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/integrations", async (request) => {
    const accounts = await listConnectedAccounts(request.currentUser);
    return {
      providers: buildProviderSummaries(),
      accounts,
    };
  });

  app.get(
    "/api/integrations/:provider/connect",
    async (request: FastifyRequest, reply) => {
      const { provider } = z.object({ provider: providerSchema }).parse(request.params);
      if (!isProviderConfigured(provider)) {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: "config_missing",
        });
        return;
      }

      if (provider !== "google") {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: "provider_not_implemented",
        });
        return;
      }

      const state = randomBytes(32).toString("base64url");
      reply.header("Set-Cookie", buildStateCookieValue(provider, state, request.currentUser.id));
      reply.redirect(buildGoogleAuthorizationUrl(state));
    },
  );

  app.get(
    "/api/integrations/:provider/callback",
    {
      config: {
        auth: false,
      },
    },
    async (request: FastifyRequest, reply) => {
      const { provider } = z.object({ provider: providerSchema }).parse(request.params);
      reply.header("Set-Cookie", buildExpiredStateCookieValue());
      const query = callbackQuerySchema.parse(request.query);

      if (query.error) {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: query.error,
        });
        return;
      }

      const cookies = parseCookies(request.headers.cookie);
      const [stateProvider, stateValue, stateUserId] = (cookies[OAUTH_STATE_COOKIE] ?? "").split(":");
      if (
        !query.state ||
        stateProvider !== provider ||
        stateValue !== query.state ||
        !stateUserId
      ) {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: "invalid_state",
        });
        return;
      }

      const user = await getUserById(stateUserId);
      if (!user) {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: "user_not_found",
        });
        return;
      }

      if (!query.code) {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: "missing_code",
        });
        return;
      }

      if (provider !== "google") {
        redirectToFrontend(reply, {
          integration: provider,
          integration_status: "error",
          integration_detail: "provider_not_implemented",
        });
        return;
      }

      try {
        const config = providerConfig("google");
        if (!config.clientId || !config.clientSecret) {
          throw new Error("Google OAuth is not configured.");
        }

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
          user,
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

  app.post(
    "/api/integrations/:provider/disconnect",
    async (request: FastifyRequest) => {
      const { provider } = z.object({ provider: providerSchema }).parse(request.params);
      await disconnectConnectedAccount(request.currentUser, provider);
      return { success: true };
    },
  );
}
