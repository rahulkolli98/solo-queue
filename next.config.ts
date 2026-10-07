import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The carousel image route reads its fonts from disk; make sure they ship with it on Vercel.
  outputFileTracingIncludes: {
    "/api/carousel/slide": ["./assets/fonts/**"],
  },
  async redirects() {
    return [
      // TASK-054 route rename: old placeholders moved.
      { source: "/compose", destination: "/studio", permanent: true },
      // An OAuth result sent to the old address lands on Connections, query intact.
      ...["connected", "error"].map((key) => ({
        source: "/settings",
        has: [{ type: "query" as const, key }],
        destination: "/settings/connections",
        permanent: false,
      })),
      // Connections is a Settings section.
      { source: "/connections", destination: "/settings/connections", permanent: true },
      // Health placeholder removed; Phase 3 rebuilds the real Health
      // screen (location TBD: Settings section vs route).
      { source: "/health", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
