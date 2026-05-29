import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Resolve the build-time commit SHA for the version label in the sidebar.
 * Prefers an explicitly provided env var (so Docker/CI builds without a .git
 * directory can still pass one), then falls back to the local git HEAD, then
 * to "dev" when neither is available.
 */
function commitSha(): string {
  if (process.env.NEXT_PUBLIC_COMMIT_SHA) return process.env.NEXT_PUBLIC_COMMIT_SHA;
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha(),
  },
};

export default nextConfig;
