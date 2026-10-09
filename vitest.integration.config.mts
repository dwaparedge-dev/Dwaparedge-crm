import { defineConfig } from "vitest/config";
import path from "node:path";

// Database-backed tests. They run inside a throwaway schema (vt_*) of the database in DATABASE_URL and
// drop it afterwards, so they never read or write real data. Run explicitly with `npm run test:db`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: { environment: "node", include: ["tests/integration/**/*.test.ts"], fileParallelism: false, testTimeout: 90_000, hookTimeout: 120_000 },
});
