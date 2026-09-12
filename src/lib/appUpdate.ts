export const UPDATE_MANIFEST_URL =
  "https://raw.githubusercontent.com/RoryOL/ChampManager/main/releases/version.json";

export type UpdateManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
};

export function manifestRequestUrl(now = Date.now()): string {
  const url = new URL(UPDATE_MANIFEST_URL);
  url.searchParams.set("t", String(now));
  return url.toString();
}

export function isAllowedApkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "github.com" || host === "raw.githubusercontent.com" || host.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed > 0) return parsed;
  }
  return null;
}

export function parseUpdateManifest(data: unknown): UpdateManifest | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const versionCode = asPositiveInt(record.versionCode);
  const apkUrl = typeof record.apkUrl === "string" ? record.apkUrl.trim() : "";
  if (!versionCode || !apkUrl || !isAllowedApkUrl(apkUrl)) return null;
  const versionName =
    typeof record.versionName === "string" && record.versionName.trim()
      ? record.versionName.trim()
      : `1.0.${versionCode}`;
  return { versionCode, versionName, apkUrl };
}

export function isNewerVersion(currentCode: number, latestCode: number): boolean {
  return latestCode > currentCode;
}

export function pluginErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

export function isUpdateDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).get("demo") === "update";
  } catch {
    return false;
  }
}
