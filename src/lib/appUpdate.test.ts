import { describe, expect, it } from "vitest";
import {
  apkDownloadUrl,
  builtAppVersion,
  isAllowedApkUrl,
  isNewerVersion,
  parseUpdateManifest,
  pluginErrorCode,
  pluginErrorMessage,
  manifestRequestUrl,
  toRawGitHubFileUrl,
} from "./appUpdate";

describe("GitHub app updates", () => {
  it("only accepts https GitHub APK URLs", () => {
    expect(isAllowedApkUrl("https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk")).toBe(true);
    expect(
      isAllowedApkUrl("https://raw.githubusercontent.com/RoryOL/ChampManager/main/releases/ChampManager.apk"),
    ).toBe(true);
    expect(isAllowedApkUrl("https://objects.githubusercontent.com/github-production-release-asset-2e65be/app.apk")).toBe(
      true,
    );
    expect(isAllowedApkUrl("http://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk")).toBe(false);
    expect(isAllowedApkUrl("https://evil.example/ChampManager.apk")).toBe(false);
    expect(isAllowedApkUrl("not a url")).toBe(false);
  });

  it("parses a GitHub version manifest and ignores junk", () => {
    expect(
      parseUpdateManifest({
        versionCode: 88,
        versionName: "1.0.88",
        apkUrl: "https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk",
      }),
    ).toEqual({
      versionCode: 88,
      versionName: "1.0.88",
      apkUrl: "https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk",
    });
    expect(
      parseUpdateManifest({
        versionCode: "91",
        apkUrl: "https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk",
      }),
    ).toMatchObject({ versionCode: 91, versionName: "1.0.91" });
    expect(parseUpdateManifest({ versionCode: 88 })).toBeNull();
    expect(
      parseUpdateManifest({
        versionCode: 88,
        apkUrl: "https://evil.example/ChampManager.apk",
      }),
    ).toBeNull();
    expect(parseUpdateManifest(null)).toBeNull();
  });

  it("only offers an update when GitHub is ahead of the installed build", () => {
    expect(isNewerVersion(80, 81)).toBe(true);
    expect(isNewerVersion(81, 81)).toBe(false);
    expect(isNewerVersion(82, 81)).toBe(false);
  });

  it("cache-busts the GitHub manifest URL and reads plugin error codes", () => {
    expect(manifestRequestUrl(123).endsWith("t=123")).toBe(true);
    expect(pluginErrorCode({ code: "NEED_PERMISSION" })).toBe("NEED_PERMISSION");
    expect(pluginErrorCode(new Error("fail"))).toBe("");
  });

  it("exposes the sideload build number for the status bar", () => {
    const version = builtAppVersion();
    expect(version.versionCode).toBeGreaterThan(0);
    expect(version.versionName).toBe(`1.0.${version.versionCode}`);
  });

  it("downloads the APK from raw GitHub instead of the html redirect", () => {
    expect(toRawGitHubFileUrl("https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk")).toBe(
      "https://raw.githubusercontent.com/RoryOL/ChampManager/main/releases/ChampManager.apk",
    );
    expect(
      apkDownloadUrl("https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk", 247, 99),
    ).toBe("https://raw.githubusercontent.com/RoryOL/ChampManager/main/releases/ChampManager.apk?v=247&t=99");
    expect(pluginErrorMessage({ message: "Could not reach GitHub." }, "fallback")).toBe("Could not reach GitHub.");
    expect(pluginErrorMessage({}, "Could not check GitHub for an update.")).toBe(
      "Could not check GitHub for an update.",
    );
  });
});
