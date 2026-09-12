import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useState } from "react";
import {
  builtAppVersion,
  isNewerVersion,
  isUpdateDemo,
  manifestRequestUrl,
  parseUpdateManifest,
  pluginErrorCode,
  type UpdateManifest,
} from "../lib/appUpdate";
import { AppUpdate, type DownloadProgress } from "../lib/appUpdateNative";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "need-permission"
  | "downloading"
  | "installing"
  | "error";

const DEMO_MANIFEST: UpdateManifest = {
  versionCode: 9999,
  versionName: "1.0.9999",
  apkUrl: "https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk",
};

const FALLBACK_VERSION = builtAppVersion();

export function useAppUpdate() {
  const demo = isUpdateDemo();
  const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const supported = native || demo;
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [current, setCurrent] = useState(demo ? { versionName: "1.0.1", versionCode: 1 } : FALLBACK_VERSION);
  const [manifest, setManifest] = useState<UpdateManifest | null>(demo ? DEMO_MANIFEST : null);
  const [progress, setProgress] = useState<DownloadProgress>({ received: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(demo);
  const [dismissed, setDismissed] = useState(false);

  const available = Boolean(manifest && isNewerVersion(current.versionCode, manifest.versionCode));

  const check = useCallback(async () => {
    if (demo) {
      setManifest(DEMO_MANIFEST);
      setCurrent({ versionName: "1.0.1", versionCode: 1 });
      setPhase("available");
      setSheetOpen(true);
      setDismissed(false);
      setError(null);
      return;
    }
    setPhase(native ? "checking" : "idle");
    setError(null);
    try {
      const version = await AppUpdate.getVersion();
      const currentCode = Number(version.versionCode) || FALLBACK_VERSION.versionCode;
      const currentName = version.versionName || FALLBACK_VERSION.versionName;
      setCurrent({ versionName: currentName, versionCode: currentCode });
      if (!native) return;
      const { text } = await AppUpdate.fetchText({ url: manifestRequestUrl() });
      const latest = parseUpdateManifest(JSON.parse(text) as unknown);
      if (!latest || !isNewerVersion(currentCode, latest.versionCode)) {
        setManifest(latest);
        setPhase("idle");
        return;
      }
      setManifest(latest);
      setPhase("available");
      setSheetOpen(true);
      setDismissed(false);
    } catch (caught) {
      setPhase("idle");
      setError(caught instanceof Error ? caught.message : "Could not check GitHub for an update.");
    }
  }, [demo, native]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (phase !== "need-permission") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void AppUpdate.canInstall().then(({ allowed }) => {
        if (allowed) setPhase("available");
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase]);

  const startUpdate = async () => {
    if (!manifest) return;
    if (demo) {
      setPhase("downloading");
      setProgress({ received: 1, total: 4 });
      window.setTimeout(() => setProgress({ received: 3, total: 4 }), 400);
      window.setTimeout(() => {
        setProgress({ received: 4, total: 4 });
        setPhase("installing");
      }, 800);
      return;
    }
    setError(null);
    setProgress({ received: 0, total: 0 });
    try {
      const { allowed } = await AppUpdate.canInstall();
      if (!allowed) {
        setPhase("need-permission");
        setSheetOpen(true);
        return;
      }
      setPhase("downloading");
      const apkUrl = new URL(manifest.apkUrl);
      apkUrl.searchParams.set("v", String(manifest.versionCode));
      const handle = await AppUpdate.addListener("downloadProgress", setProgress);
      try {
        await AppUpdate.downloadAndInstall({ url: apkUrl.toString() });
        setPhase("installing");
      } finally {
        await handle.remove();
      }
    } catch (caught) {
      if (pluginErrorCode(caught) === "NEED_PERMISSION") {
        setPhase("need-permission");
        setSheetOpen(true);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not install the GitHub update.");
      setPhase("error");
      setSheetOpen(true);
    }
  };

  const allowInstalls = async () => {
    try {
      await AppUpdate.openInstallSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open Android install settings.");
      setPhase("error");
    }
  };

  const dismiss = () => {
    if (phase === "downloading") return;
    setSheetOpen(false);
    setDismissed(true);
    if (phase === "installing" || phase === "error") {
      setPhase("available");
      setProgress({ received: 0, total: 0 });
    }
  };

  const reopen = () => {
    if (!available) return;
    setSheetOpen(true);
    setDismissed(false);
  };

  return {
    supported,
    available,
    phase,
    current,
    manifest,
    progress,
    error,
    sheetOpen: supported && available && sheetOpen,
    bannerOpen: supported && available && dismissed && !sheetOpen,
    check,
    startUpdate,
    allowInstalls,
    dismiss,
    reopen,
  };
}
