import { existsSync } from "node:fs";
import { resolve } from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

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
    DEV_AUTH_USER_EMAIL: z.string().optional(),
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
      devAuthUserEmail: env.DEV_AUTH_USER_EMAIL,
      allowedOrigins: env.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    };
  });

export const settings = envSchema.parse(process.env);
