import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

const parentEnvPath = resolve(process.cwd(), "..", ".env");
if (existsSync(parentEnvPath)) {
  const envFile = readFileSync(parentEnvPath, "utf8");
  for (const line of envFile.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#") || !trimmedLine.includes("=")) {
      continue;
    }

    const [key, ...rawValueParts] = trimmedLine.split("=");
    const value = rawValueParts.join("=").replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
