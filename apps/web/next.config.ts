import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Next writes AGENTS.md and CLAUDE.md into the app by default; this repo
  // keeps its own docs.
  agentRules: false,
  transpilePackages: ["@choppilot/shared"],
};

export default config;
