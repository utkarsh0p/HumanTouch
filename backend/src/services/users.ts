import { randomUUID } from "node:crypto";

import { settings } from "../config.js";
import { defaultCompanyId } from "../constants/seed.js";
import { query } from "../db/postgres.js";
import type { AuthenticatedUser, UserWithPasswordHash } from "../types/auth.js";

const appSchema = `"${settings.appSchema.replaceAll('"', '""')}"`;
const usersTable = `${appSchema}.users`;

export async function getUserByEmail(email: string): Promise<AuthenticatedUser | null> {
  const [user] = await query<AuthenticatedUser>(
    `SELECT id, company_id, email, full_name, role_key, is_admin
     FROM ${usersTable}
     WHERE lower(email) = lower($1)`,
    [email],
  );

  return user ?? null;
}

export async function getUserById(userId: string): Promise<AuthenticatedUser | null> {
  const [user] = await query<AuthenticatedUser>(
    `SELECT id, company_id, email, full_name, role_key, is_admin
     FROM ${usersTable}
     WHERE id = $1`,
    [userId],
  );

  return user ?? null;
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

  return await query<AuthenticatedUser>(
    `SELECT id, company_id, email, full_name, role_key, is_admin
     FROM ${usersTable}
     WHERE company_id = $1
       AND lower(email) = ANY($2::text[])`,
    [companyId, normalizedEmails],
  );
}

export async function getUserByEmailWithPasswordHash(
  email: string,
): Promise<UserWithPasswordHash | null> {
  const [user] = await query<UserWithPasswordHash>(
    `SELECT id, company_id, email, full_name, role_key, is_admin, password_hash
     FROM ${usersTable}
     WHERE lower(email) = lower($1)`,
    [email],
  );

  return user ?? null;
}

export type CreateLocalUserInput = {
  email: string;
  full_name: string;
  password_hash: string;
};

export async function createLocalUser(input: CreateLocalUserInput): Promise<AuthenticatedUser> {
  const [user] = await query<AuthenticatedUser>(
    `INSERT INTO ${usersTable}
     (id, company_id, email, full_name, role_key, is_admin, auth_provider, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'employee', FALSE, 'local', $5, NOW(), NOW())
     RETURNING id, company_id, email, full_name, role_key, is_admin`,
    [randomUUID(), defaultCompanyId, input.email, input.full_name, input.password_hash],
  );

  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
}
