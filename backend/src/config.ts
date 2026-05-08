import { existsSync } from "node:fs";
import { resolve } from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

function expandAllowedOrigins(origins: string[]): string[] {
  const expanded = new Set<string>();

  for (const origin of origins) {
    expanded.add(origin);

    try {
      const url = new URL(origin);
      if (url.hostname === "localhost") {
        expanded.add(`${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ""}`);
      } else if (url.hostname === "127.0.0.1") {
        expanded.add(`${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`);
      }
    } catch {
      expanded.add(origin);
    }
  }

  return [...expanded];
}

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    APP_DB_SCHEMA: z.string().min(1).default("humantouch"),
    LANGGRAPH_DB_SCHEMA: z.string().min(1).default("langgraph"),
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-pro"),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  })
  .transform((env) => {
    const googleApiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;

    if (!googleApiKey) {
      throw new Error("Set GEMINI_API_KEY or GOOGLE_API_KEY in the environment.");
    }

    return {
      port: env.PORT,
      databaseUrl: env.DATABASE_URL,
      appSchema: env.APP_DB_SCHEMA,
      langgraphSchema: env.LANGGRAPH_DB_SCHEMA,
      googleApiKey,
      geminiModel: env.GEMINI_MODEL,
      allowedOrigins: expandAllowedOrigins(
        env.ALLOWED_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    };
  });

export const settings = envSchema.parse(process.env);
