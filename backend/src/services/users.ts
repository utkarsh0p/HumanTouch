import { settings } from "../config.js";
import { defaultAdminUserId } from "../constants/seed.js";
import { query } from "../db/postgres.js";
import type { AuthenticatedUser } from "../types/auth.js";

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

export async function getDefaultDevUser(): Promise<AuthenticatedUser | null> {
  const email = settings.devAuthUserEmail;
  if (email) {
    const byEmail = await getUserByEmail(email);
    if (byEmail) {
      return byEmail;
    }
  }

  return await getUserById(defaultAdminUserId);
}
