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

/**
 * Whether to show the Pride styling (rainbow wordmark + "trans rights" tagline).
 * Resolved at build time so the value is baked identically into the prerendered
 * HTML and the client bundle — no hydration mismatch, no first-paint flash.
 * Auto-enables during June (Pride Month). Override with NEXT_PUBLIC_PRIDE:
 * 1/true/on/yes force it on, anything else forces it off.
 */
function prideEnabled(): "1" | "0" {
  const override = process.env.NEXT_PUBLIC_PRIDE;
  if (override) return /^(1|true|on|yes)$/i.test(override.trim()) ? "1" : "0";
  return new Date().getMonth() === 5 ? "1" : "0"; // 5 = June
}

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha(),
    NEXT_PUBLIC_PRIDE: prideEnabled(),
  },
};

export default nextConfig;
