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

function includeCommonDevOrigins(origins: string[]): string[] {
  const devOrigins = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:3003",
  ];

  return [...new Set([...origins, ...devOrigins])];
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
    APP_DB_SCHEMA: z.string().min(1).default("cemberai"),
    LANGGRAPH_DB_SCHEMA: z.string().min(1).default("langgraph"),
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-pro"),
    COMPOSIO_API_KEY: z.string().optional(),
    COMPOSIO_TAVILY_AUTH_CONFIG_ID: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
    FRONTEND_BASE_URL: z.string().url().optional(),
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
      composioApiKey: env.COMPOSIO_API_KEY,
      composioTavilyAuthConfigId: env.COMPOSIO_TAVILY_AUTH_CONFIG_ID?.trim(),
      tavilyApiKey: env.TAVILY_API_KEY?.trim(),
      allowedOrigins: expandAllowedOrigins(
        includeCommonDevOrigins(
          env.ALLOWED_ORIGINS.split(",")
            .map((origin) => origin.trim())
            .filter(Boolean),
        ),
      ),
      frontendBaseUrl:
        env.FRONTEND_BASE_URL ??
        env.ALLOWED_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)[0] ??
        "http://localhost:3000",
    };
  });

export const settings = envSchema.parse(process.env);
