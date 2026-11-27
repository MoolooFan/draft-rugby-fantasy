import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16.4+ writes an AGENTS.md note into the project when the local server starts; not
  // wanted in this repo (27 Nov 2026)
  agentRules: false,
};

export default nextConfig;
