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
    APP_DB_SCHEMA: z.string().min(1).default("humantouch"),
    LANGGRAPH_DB_SCHEMA: z.string().min(1).default("langgraph"),
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-pro"),
    TAVILY_API_KEY: z.string().optional(),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
    FRONTEND_BASE_URL: z.string().url().optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
    GOOGLE_OAUTH_SCOPES: z.string().optional(),
    AUTH_SECRET: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    LINKEDIN_REDIRECT_URI: z.string().url().optional(),
    LINKEDIN_SCOPES: z.string().optional(),
    META_CLIENT_ID: z.string().optional(),
    META_CLIENT_SECRET: z.string().optional(),
    META_REDIRECT_URI: z.string().url().optional(),
    META_SCOPES: z.string().optional(),
    TOKEN_ENCRYPTION_KEY: z.string().optional(),
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
      tavilyApiKey: env.TAVILY_API_KEY,
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
      googleOAuth: {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? env.AUTH_GOOGLE_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? env.AUTH_GOOGLE_SECRET,
        redirectUri:
          env.GOOGLE_OAUTH_REDIRECT_URI ??
          `http://localhost:${env.PORT}/api/integrations/google/callback`,
        scopes:
          env.GOOGLE_OAUTH_SCOPES?.split(",")
            .map((scope) => scope.trim())
            .filter(Boolean) ?? [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.compose",
            "https://www.googleapis.com/auth/gmail.readonly",
          ],
      },
      linkedinOAuth: {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        redirectUri:
          env.LINKEDIN_REDIRECT_URI ??
          `http://localhost:${env.PORT}/api/integrations/linkedin/callback`,
        scopes:
          env.LINKEDIN_SCOPES?.split(",")
            .map((scope) => scope.trim())
            .filter(Boolean) ?? ["openid", "profile", "email"],
      },
      metaOAuth: {
        clientId: env.META_CLIENT_ID,
        clientSecret: env.META_CLIENT_SECRET,
        redirectUri:
          env.META_REDIRECT_URI ??
          `http://localhost:${env.PORT}/api/integrations/meta/callback`,
        scopes:
          env.META_SCOPES?.split(",")
            .map((scope) => scope.trim())
            .filter(Boolean) ?? ["email", "public_profile"],
      },
      authSecret: env.AUTH_SECRET,
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    };
  });

export const settings = envSchema.parse(process.env);
