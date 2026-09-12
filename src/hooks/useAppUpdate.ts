import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  apkDownloadUrl,
  builtAppVersion,
  isNewerVersion,
  isUpdateDemo,
  manifestRequestUrl,
  parseUpdateManifest,
  pluginErrorCode,
  pluginErrorMessage,
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
  apkUrl: "https://raw.githubusercontent.com/RoryOL/ChampManager/main/releases/ChampManager.apk",
};

const FALLBACK_VERSION = builtAppVersion();

async function readManifestText(): Promise<string> {
  try {
    const { text } = await AppUpdate.fetchText({ url: manifestRequestUrl() });
    if (text.trim()) return text;
  } catch {
    // WebView fetch still works when the native plugin is late or blocked.
  }
  const response = await fetch(manifestRequestUrl(), { cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return response.text();
}

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
  const dismissedRef = useRef(false);
  const phaseRef = useRef<UpdatePhase>("idle");

  const available = Boolean(manifest && isNewerVersion(current.versionCode, manifest.versionCode));

  const check = useCallback(async (opts?: { open?: boolean }) => {
    if (demo) {
      setManifest(DEMO_MANIFEST);
      setCurrent({ versionName: "1.0.1", versionCode: 1 });
      setPhase("available");
      setSheetOpen(true);
      setDismissed(false);
      setError(null);
      return "update" as const;
    }
    if (phaseRef.current === "downloading" || phaseRef.current === "installing") return "ok" as const;
    setPhase(native ? "checking" : "idle");
    setError(null);
    try {
      let currentCode = FALLBACK_VERSION.versionCode;
      let currentName = FALLBACK_VERSION.versionName;
      try {
        const version = await AppUpdate.getVersion();
        currentCode = Number(version.versionCode) || FALLBACK_VERSION.versionCode;
        currentName = version.versionName || FALLBACK_VERSION.versionName;
      } catch {
        // Corner version still comes from the JS build if the plugin is late.
      }
      setCurrent({ versionName: currentName, versionCode: currentCode });
      if (!native) return "ok" as const;
      const text = await readManifestText();
      const latest = parseUpdateManifest(JSON.parse(text) as unknown);
      if (!latest || !isNewerVersion(currentCode, latest.versionCode)) {
        setManifest(latest);
        setPhase("idle");
        return "ok" as const;
      }
      setManifest(latest);
      setPhase("available");
      if (opts?.open || !dismissedRef.current) {
        setSheetOpen(true);
        setDismissed(false);
      }
      return "update" as const;
    } catch (caught) {
      setPhase("idle");
      setError(pluginErrorMessage(caught, "Could not check GitHub for an update."));
      return "fail" as const;
    }
  }, [demo, native]);

  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (cancelled) return;
        const result = await check();
        if (cancelled || result !== "fail") return;
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [check]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (phaseRef.current === "need-permission") {
        void AppUpdate.canInstall().then(({ allowed }) => {
          if (allowed) setPhase("available");
        });
      }
      if (native && phaseRef.current !== "downloading" && phaseRef.current !== "installing") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check, native]);

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
      const handle = await AppUpdate.addListener("downloadProgress", setProgress);
      try {
        await AppUpdate.downloadAndInstall({ url: apkDownloadUrl(manifest.apkUrl, manifest.versionCode) });
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
      setError(pluginErrorMessage(caught, "Could not install the GitHub update."));
      setPhase("error");
      setSheetOpen(true);
    }
  };

  const allowInstalls = async () => {
    try {
      await AppUpdate.openInstallSettings();
    } catch (caught) {
      setError(pluginErrorMessage(caught, "Could not open Android install settings."));
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
