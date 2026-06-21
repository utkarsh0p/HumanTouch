import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getAppSchema(): string {
  return process.env.APP_DB_SCHEMA ?? "cemberai";
}

function buildDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before using Prisma.");
  }

  const url = new URL(databaseUrl);
  url.searchParams.set("schema", getAppSchema());
  return url.toString();
}

const adapter = new PrismaPg({ connectionString: buildDatabaseUrl() }, { schema: getAppSchema() });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
