import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // TASK-054 route rename: old placeholders moved.
      { source: "/compose", destination: "/studio", permanent: true },
      // Connections live directly on /settings (no nested route).
      { source: "/connections", destination: "/settings", permanent: true },
      {
        source: "/settings/connections",
        destination: "/settings",
        permanent: true,
      },
      // Health placeholder removed; Phase 3 rebuilds the real Health
      // screen (location TBD: Settings section vs route).
      { source: "/health", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
