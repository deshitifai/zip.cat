import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const envFiles = [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), ".env"),
  "/Users/russ/cats/.env",
  "/Users/russ/projects/cats/.env"
];

export function loadEnv() {
  for (const path of envFiles) {
    if (existsSync(path)) {
      config({ path, override: false, quiet: true });
    }
  }
}
