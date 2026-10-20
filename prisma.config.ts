// CompliBot - Prisma v7 Configuration
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` (run on postinstall) does not need a database, so a
    // missing DATABASE_URL must not abort a fresh `npm install`. Commands that
    // do talk to the database (db push, seed) fail with a clear connection
    // error instead.
    url:
      process.env.DATABASE_URL ??
      "postgresql://unset:unset@localhost:5432/unset",
  },
});
