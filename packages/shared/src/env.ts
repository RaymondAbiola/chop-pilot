import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Walks up from the calling module to find the repo-root .env, so the same
// code works whether it runs from src via tsx or from a built dist.
export function loadRootEnv(fromUrl: string): string | undefined {
  let dir = dirname(fileURLToPath(fromUrl));

  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value === "REPLACE_ME") {
    throw new Error(`${name} is missing from .env`);
  }
  return value;
}
