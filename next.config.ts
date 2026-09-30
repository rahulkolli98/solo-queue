import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // TASK-054 route rename: old placeholders moved.
      { source: "/compose", destination: "/studio", permanent: true },
      // TASK-057: connections moved under settings.
      {
        source: "/connections",
        destination: "/settings/connections",
        permanent: true,
      },
      // Health placeholder removed; Phase 3 rebuilds the real Health
      // screen (location TBD: Settings section vs route).
      { source: "/health", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
