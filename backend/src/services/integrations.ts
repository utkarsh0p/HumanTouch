import { randomUUID } from "node:crypto";

import { settings } from "../config.js";
import { prisma } from "../db/prisma.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { decryptToken, encryptToken } from "./token-encryption.js";

const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60 * 1000;

export type IntegrationProvider = "google" | "github" | "linkedin" | "meta";

type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type ProviderProfile = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type GoogleUserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

type GitHubUserResponse = {
  id?: number;
  login?: string;
  email?: string | null;
  name?: string | null;
};

type GitHubEmailResponse = {
  email?: string;
  primary?: boolean;
  verified?: boolean;
};

type TokenRefreshInput = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type ProviderTokenAdapter = {
  tokenEndpoint: string;
  refreshAccessToken?: (input: TokenRefreshInput) => Promise<OAuthTokenResponse>;
  fetchProfile: (accessToken: string) => Promise<ProviderProfile>;
};

export type IntegrationAccountSummary = {
  id: string;
  provider: string;
  provider_account_id: string;
  provider_email: string | null;
  scopes: string[];
  status: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConnectedAccountCredentials = {
  accessToken: string;
  scopes: string[];
  providerEmail: string;
};

function parseScopes(scope: string | undefined, fallback: string[] = []): string[] {
  return scope
    ?.split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean) ?? fallback;
}

function expiresAtFromSeconds(expiresIn: number | undefined): Date | null {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
}

async function refreshWithStandardOAuthTokenEndpoint(input: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuthTokenResponse> {
  const response = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as OAuthTokenResponse;
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? "OAuth token refresh failed.");
  }

  return payload;
}

async function fetchGitHubJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error("Failed to load GitHub account profile.");
  }

  return payload;
}

const providerTokenAdapters: Record<IntegrationProvider, ProviderTokenAdapter> = {
  google: {
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    refreshAccessToken: (input) =>
      refreshWithStandardOAuthTokenEndpoint({
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
      }),
    fetchProfile: async (accessToken) => {
      const googleUser = await fetchGoogleUserInfo(accessToken);
      if (!googleUser.sub) {
        throw new Error("Google account profile did not include an id.");
      }

      return {
        id: googleUser.sub,
        email: googleUser.email?.toLowerCase() ?? null,
        name: googleUser.name ?? null,
      };
    },
  },
  github: {
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    fetchProfile: async (accessToken) => {
      const githubUser = await fetchGitHubJson<GitHubUserResponse>(
        "https://api.github.com/user",
        accessToken,
      );
      if (!githubUser.id) {
        throw new Error("GitHub account profile did not include an id.");
      }

      let email = githubUser.email?.toLowerCase() ?? null;
      if (!email) {
        const emails = await fetchGitHubJson<GitHubEmailResponse[]>(
          "https://api.github.com/user/emails",
          accessToken,
        );
        email =
          emails
            .find((item) => item.primary && item.verified && item.email)
            ?.email?.toLowerCase() ??
          emails.find((item) => item.verified && item.email)?.email?.toLowerCase() ??
          null;
      }

      return {
        id: String(githubUser.id),
        email,
        name: githubUser.name ?? githubUser.login ?? null,
      };
    },
  },
  linkedin: {
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    refreshAccessToken: (input) =>
      refreshWithStandardOAuthTokenEndpoint({
        tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
      }),
    fetchProfile: async () => {
      throw new Error("LinkedIn OAuth profile sync is not implemented yet.");
    },
  },
  meta: {
    tokenEndpoint: "https://graph.facebook.com/v20.0/oauth/access_token",
    fetchProfile: async () => {
      throw new Error("Meta OAuth profile sync is not implemented yet.");
    },
  },
};

function providerOAuthConfig(provider: IntegrationProvider): {
  clientId?: string;
  clientSecret?: string;
} {
  if (provider === "google") {
    return settings.googleOAuth;
  }
  if (provider === "github") {
    return settings.githubOAuth;
  }
  if (provider === "linkedin") {
    return settings.linkedinOAuth;
  }
  return settings.metaOAuth;
}

function toSummary(account: {
  id: string;
  provider: string;
  providerAccountId: string;
  providerEmail: string | null;
  scopes: string[];
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): IntegrationAccountSummary {
  return {
    id: account.id,
    provider: account.provider,
    provider_account_id: account.providerAccountId,
    provider_email: account.providerEmail,
    scopes: account.scopes,
    status: account.status,
    expires_at: account.expiresAt?.toISOString() ?? null,
    created_at: account.createdAt.toISOString(),
    updated_at: account.updatedAt.toISOString(),
  };
}

export async function listConnectedAccounts(
  user: AuthenticatedUser,
): Promise<IntegrationAccountSummary[]> {
  const accounts = await prisma.connectedAccount.findMany({
    where: {
      companyId: user.company_id,
      userId: user.id,
    },
    orderBy: [{ provider: "asc" }, { createdAt: "desc" }],
  });

  return accounts.map(toSummary);
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  return exchangeProviderAuthorizationCode("google", input);
}

export async function exchangeProviderAuthorizationCode(
  provider: IntegrationProvider,
  input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
): Promise<OAuthTokenResponse> {
  const adapter = providerTokenAdapters[provider];
  const response = await fetch(adapter.tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as OAuthTokenResponse;
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? `${provider} token exchange failed.`);
  }

  return payload;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfoResponse> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json()) as GoogleUserInfoResponse;
  if (!response.ok) {
    throw new Error("Failed to load Google account profile.");
  }

  return payload;
}

export async function saveGoogleConnectedAccount(input: {
  user: AuthenticatedUser;
  tokenResponse: OAuthTokenResponse;
  googleUser: GoogleUserInfoResponse;
}): Promise<IntegrationAccountSummary> {
  if (!input.googleUser.sub) {
    throw new Error("Google account profile did not include an id.");
  }

  return saveConnectedAccount({
    user: input.user,
    provider: "google",
    tokenResponse: input.tokenResponse,
    profile: {
      id: input.googleUser.sub,
      email: input.googleUser.email?.toLowerCase() ?? null,
      name: input.googleUser.name ?? null,
    },
  });
}

export async function fetchProviderProfile(
  provider: IntegrationProvider,
  accessToken: string,
): Promise<ProviderProfile> {
  return providerTokenAdapters[provider].fetchProfile(accessToken);
}

export async function saveConnectedAccount(input: {
  user: AuthenticatedUser;
  provider: IntegrationProvider;
  tokenResponse: OAuthTokenResponse;
  profile: ProviderProfile;
}): Promise<IntegrationAccountSummary> {
  if (!input.tokenResponse.access_token) {
    throw new Error(`${input.provider} did not return an access token.`);
  }

  const existingAccount = await prisma.connectedAccount.findUnique({
    where: {
      userId_provider_providerAccountId: {
        userId: input.user.id,
        provider: input.provider,
        providerAccountId: input.profile.id,
      },
    },
  });

  const scopes = parseScopes(input.tokenResponse.scope);
  const expiresAt = expiresAtFromSeconds(input.tokenResponse.expires_in);
  const encryptedRefreshToken =
    encryptToken(input.tokenResponse.refresh_token) ??
    existingAccount?.encryptedRefreshToken ??
    null;

  const account = await prisma.connectedAccount.upsert({
    where: {
      userId_provider_providerAccountId: {
        userId: input.user.id,
        provider: input.provider,
        providerAccountId: input.profile.id,
      },
    },
    create: {
      id: randomUUID(),
      companyId: input.user.company_id,
      userId: input.user.id,
      provider: input.provider,
      providerAccountId: input.profile.id,
      providerEmail: input.profile.email?.toLowerCase() ?? null,
      encryptedAccessToken: encryptToken(input.tokenResponse.access_token),
      encryptedRefreshToken,
      scopes,
      expiresAt,
      status: "connected",
    },
    update: {
      companyId: input.user.company_id,
      providerEmail: input.profile.email?.toLowerCase() ?? null,
      encryptedAccessToken: encryptToken(input.tokenResponse.access_token),
      encryptedRefreshToken,
      scopes,
      expiresAt,
      status: "connected",
      updatedAt: new Date(),
    },
  });

  return toSummary(account);
}

export async function getConnectedAccountCredentials(input: {
  provider: IntegrationProvider;
  userId: string;
  companyId: string;
  requiredScopes: string[];
}): Promise<ConnectedAccountCredentials> {
  const account = await prisma.connectedAccount.findFirst({
    where: {
      companyId: input.companyId,
      userId: input.userId,
      provider: input.provider,
      status: "connected",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!account?.encryptedAccessToken) {
    throw new Error(`${input.provider} account is not connected. Connect ${input.provider} before using its tools.`);
  }

  const missingScopes = input.requiredScopes.filter((scope) => !account.scopes.includes(scope));
  if (missingScopes.length > 0) {
    throw new Error(`Google account is missing required Gmail scope(s): ${missingScopes.join(", ")}.`);
  }

  let accessToken = decryptToken(account.encryptedAccessToken);
  if (!accessToken) {
    throw new Error(`${input.provider} access token is unavailable. Reconnect ${input.provider} before using its tools.`);
  }

  if (account.expiresAt && account.expiresAt.getTime() <= Date.now() + ACCESS_TOKEN_EXPIRY_SKEW_MS) {
    const refreshToken = decryptToken(account.encryptedRefreshToken);
    if (!refreshToken) {
      throw new Error(`${input.provider} access token is expired and no refresh token is available. Reconnect ${input.provider} before using its tools.`);
    }

    const adapter = providerTokenAdapters[input.provider];
    if (!adapter.refreshAccessToken) {
      throw new Error(`${input.provider} access token is expired and automatic refresh is not supported yet. Reconnect ${input.provider} before using its tools.`);
    }

    const config = providerOAuthConfig(input.provider);
    if (!config.clientId || !config.clientSecret) {
      throw new Error(`${input.provider} OAuth client id and secret are not configured.`);
    }

    const refreshedToken = await adapter.refreshAccessToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
    if (!refreshedToken.access_token) {
      throw new Error(`${input.provider} did not return a refreshed access token. Reconnect ${input.provider} before using its tools.`);
    }

    const refreshedScopes = parseScopes(refreshedToken.scope, account.scopes);
    const refreshedExpiresAt = expiresAtFromSeconds(refreshedToken.expires_in);

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        encryptedAccessToken: encryptToken(refreshedToken.access_token),
        scopes: refreshedScopes,
        expiresAt: refreshedExpiresAt,
        status: "connected",
        updatedAt: new Date(),
      },
    });

    accessToken = refreshedToken.access_token;
  }

  return {
    accessToken,
    scopes: account.scopes,
    providerEmail: account.providerEmail ?? "",
  };
}

export async function getGoogleConnectedAccountCredentials(input: {
  userId: string;
  companyId: string;
  requiredScopes: string[];
}): Promise<ConnectedAccountCredentials> {
  return getConnectedAccountCredentials({
    provider: "google",
    ...input,
  });
}

export async function disconnectConnectedAccount(
  user: AuthenticatedUser,
  provider: string,
): Promise<void> {
  await prisma.connectedAccount.updateMany({
    where: {
      companyId: user.company_id,
      userId: user.id,
      provider,
    },
    data: {
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      status: "disconnected",
      updatedAt: new Date(),
    },
  });
}

export async function disconnectGoogleAccount(user: AuthenticatedUser): Promise<void> {
  await disconnectConnectedAccount(user, "google");
}
