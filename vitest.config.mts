import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // No test renders components; the one that needs `window` opts into jsdom
    // with a @vitest-environment docblock. jsdom per file was most of the
    // cold-start time.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        ".next",
        "src/generated/**",
        "src/test/**",
        "**/*.d.ts",
        "**/*.config.*",
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
