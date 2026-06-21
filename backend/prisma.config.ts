import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

function buildDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running Prisma commands.");
  }

  const url = new URL(databaseUrl);
  url.searchParams.set("schema", process.env.APP_DB_SCHEMA ?? "cemberai");
  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildDatabaseUrl(),
  },
});
