#!/usr/bin/env node
// Creates .env from .env.example with random secrets (works on Windows, macOS, Linux).
//   node scripts/setup-env.mjs          # refuses to overwrite an existing .env
//   node scripts/setup-env.mjs --force  # overwrite
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".env");

if (existsSync(target) && !process.argv.includes("--force")) {
  console.error(".env already exists (use --force to overwrite)");
  process.exit(1);
}

const hex = (bytes) => randomBytes(bytes).toString("hex");
const values = {
  POSTGRES_PASSWORD: hex(24),
  COMPLIBOT_DB_PASSWORD: hex(24),
  REDIS_PASSWORD: hex(24),
  AUTH_SECRET: hex(32),
  ENCRYPTION_KEY: hex(32), // 64 hex chars
};

let env = readFileSync(join(root, ".env.example"), "utf8");
for (const [key, value] of Object.entries(values)) {
  env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
}
// Keep the host-side DATABASE_URL (npm run dev, prisma CLI) in sync.
env = env.replace(
  /^DATABASE_URL=postgresql:\/\/postgres:[^@]*@/m,
  `DATABASE_URL=postgresql://postgres:${values.POSTGRES_PASSWORD}@`,
);

writeFileSync(target, env);
console.log("Wrote .env with random secrets. Review OLLAMA_MODEL and the ports, then run: docker compose up -d --build");
