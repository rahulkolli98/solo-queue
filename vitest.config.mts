import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const shared = {
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "app",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Convex functions run against convex-test's in-memory backend.
        ...shared,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
});
