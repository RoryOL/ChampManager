import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function sideloadVersionCode(): number {
  try {
    const out = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
    return Math.max(1, Number(out) || 1);
  } catch {
    return 1;
  }
}

const versionCode = sideloadVersionCode();
const versionName = `1.0.${versionCode}`;

export default defineConfig({
  define: {
    __APP_VERSION_CODE__: JSON.stringify(versionCode),
    __APP_VERSION_NAME__: JSON.stringify(versionName),
  },
  plugins: [react()],
  test: {
    environment: "node",
  },
});
