import { randomUUID } from "node:crypto";

import { defaultCompanyId } from "../constants/seed.js";
import { prisma } from "../db/prisma.js";
import type { AuthenticatedUser, UserWithPasswordHash } from "../types/auth.js";

function toAuthenticatedUser(user: {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  roleKey: string;
  isAdmin: boolean;
}): AuthenticatedUser {
  return {
    id: user.id,
    company_id: user.companyId,
    email: user.email,
    full_name: user.fullName,
    role_key: user.roleKey,
    is_admin: user.isAdmin,
  };
}

export async function getUserByEmail(email: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

  return user ? toAuthenticatedUser(user) : null;
}

export async function getUserById(userId: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  return user ? toAuthenticatedUser(user) : null;
}

export async function getUsersByEmails(
  emails: string[],
  companyId: string,
): Promise<AuthenticatedUser[]> {
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(
    Boolean,
  );

  if (normalizedEmails.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      companyId,
      OR: normalizedEmails.map((email) => ({
        email: {
          equals: email,
          mode: "insensitive" as const,
        },
      })),
    },
  });

  return users.map(toAuthenticatedUser);
}

export async function getUserByEmailWithPasswordHash(
  email: string,
): Promise<UserWithPasswordHash | null> {
  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

  return user
    ? {
        ...toAuthenticatedUser(user),
        password_hash: user.passwordHash,
      }
    : null;
}

export type CreateLocalUserInput = {
  email: string;
  full_name: string;
  password_hash: string;
};

export async function createLocalUser(input: CreateLocalUserInput): Promise<AuthenticatedUser> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      companyId: defaultCompanyId,
      email: input.email,
      fullName: input.full_name,
      roleKey: "employee",
      isAdmin: false,
      authProvider: "local",
      passwordHash: input.password_hash,
    },
  });

  return toAuthenticatedUser(user);
}

export type CreateOAuthUserInput = {
  email: string;
  full_name: string;
  auth_provider: string;
};

export async function createOAuthUser(input: CreateOAuthUserInput): Promise<AuthenticatedUser> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      companyId: defaultCompanyId,
      email: input.email,
      fullName: input.full_name,
      roleKey: "employee",
      isAdmin: false,
      authProvider: input.auth_provider,
      passwordHash: null,
    },
  });

  return toAuthenticatedUser(user);
}

export async function markUserOAuthAuthenticated(
  userId: string,
  authProvider: string,
): Promise<AuthenticatedUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      authProvider,
      updatedAt: new Date(),
    },
  });

  return toAuthenticatedUser(user);
}

export async function resolveOrCreateOAuthUser(input: {
  email: string;
  full_name?: string | null;
  auth_provider: string;
}): Promise<AuthenticatedUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return markUserOAuthAuthenticated(existingUser.id, input.auth_provider);
  }

  return createOAuthUser({
    email: normalizedEmail,
    full_name:
      input.full_name?.trim() || normalizedEmail.split("@")[0] || normalizedEmail,
    auth_provider: input.auth_provider,
  });
}

export async function resolveOrCreateGoogleUser(input: {
  email: string;
  full_name?: string | null;
}): Promise<AuthenticatedUser> {
  return resolveOrCreateOAuthUser({
    ...input,
    auth_provider: "google",
  });
}
