import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { encryptToken } from "./token-encryption.js";

const GOOGLE_PROVIDER = "google";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export type IntegrationAccountSummary = {
  id: string;
  provider: string;
  provider_account_id: string;
  provider_email: string;
  scopes: string[];
  status: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function toSummary(account: {
  id: string;
  provider: string;
  providerAccountId: string;
  providerEmail: string;
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
}): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
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

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? "Google token exchange failed.");
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
  tokenResponse: GoogleTokenResponse;
  googleUser: GoogleUserInfoResponse;
}): Promise<IntegrationAccountSummary> {
  if (!input.tokenResponse.access_token) {
    throw new Error("Google did not return an access token.");
  }
  if (!input.googleUser.sub || !input.googleUser.email) {
    throw new Error("Google account profile did not include an id and email.");
  }

  const existingAccount = await prisma.connectedAccount.findUnique({
    where: {
      userId_provider_providerAccountId: {
        userId: input.user.id,
        provider: GOOGLE_PROVIDER,
        providerAccountId: input.googleUser.sub,
      },
    },
  });

  const scopes =
    input.tokenResponse.scope
      ?.split(" ")
      .map((scope) => scope.trim())
      .filter(Boolean) ?? [];
  const expiresAt = input.tokenResponse.expires_in
    ? new Date(Date.now() + input.tokenResponse.expires_in * 1000)
    : null;
  const encryptedRefreshToken =
    encryptToken(input.tokenResponse.refresh_token) ??
    existingAccount?.encryptedRefreshToken ??
    null;

  const account = await prisma.connectedAccount.upsert({
    where: {
      userId_provider_providerAccountId: {
        userId: input.user.id,
        provider: GOOGLE_PROVIDER,
        providerAccountId: input.googleUser.sub,
      },
    },
    create: {
      id: randomUUID(),
      companyId: input.user.company_id,
      userId: input.user.id,
      provider: GOOGLE_PROVIDER,
      providerAccountId: input.googleUser.sub,
      providerEmail: input.googleUser.email.toLowerCase(),
      encryptedAccessToken: encryptToken(input.tokenResponse.access_token),
      encryptedRefreshToken,
      scopes,
      expiresAt,
      status: "connected",
    },
    update: {
      companyId: input.user.company_id,
      providerEmail: input.googleUser.email.toLowerCase(),
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

export async function disconnectGoogleAccount(user: AuthenticatedUser): Promise<void> {
  await prisma.connectedAccount.updateMany({
    where: {
      companyId: user.company_id,
      userId: user.id,
      provider: GOOGLE_PROVIDER,
    },
    data: {
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      status: "disconnected",
      updatedAt: new Date(),
    },
  });
}
