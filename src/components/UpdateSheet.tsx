import type { DownloadProgress } from "../lib/appUpdateNative";
import type { UpdateManifest } from "../lib/appUpdate";
import type { UpdatePhase } from "../hooks/useAppUpdate";

type Props = {
  phase: UpdatePhase;
  currentName: string;
  manifest: UpdateManifest;
  progress: DownloadProgress;
  error: string | null;
  onUpdate: () => void;
  onAllow: () => void;
  onLater: () => void;
  onRetry: () => void;
};

function percent(progress: DownloadProgress): number {
  if (progress.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress.received / progress.total) * 100)));
}

function Progress({ progress }: { progress: DownloadProgress }) {
  const value = percent(progress);
  return (
    <div className="update-progress">
      <div
        className="update-progress__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <i style={{ width: `${value}%` }} />
      </div>
      <span>{progress.total > 0 ? `${value}%` : "Starting…"}</span>
    </div>
  );
}

export function UpdateBanner({
  versionName,
  onOpen,
}: {
  versionName: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="update-banner" onClick={onOpen}>
      <span>
        New GitHub build {versionName}
        <em>Tap to update in place. Your save stays on the phone.</em>
      </span>
      <strong>Update</strong>
    </button>
  );
}

export function UpdateSheet({
  phase,
  currentName,
  manifest,
  progress,
  error,
  onUpdate,
  onAllow,
  onLater,
  onRetry,
}: Props) {
  const busy = phase === "downloading" || phase === "installing";
  return (
    <div className="update-scrim" role="presentation" onClick={busy ? undefined : onLater}>
      <section
        className="welcome-card update-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p>Capture the Canon</p>
        <h2 id="update-title">{phase === "installing" ? "Install the update" : "Update from GitHub"}</h2>
        <p>
          {phase === "need-permission"
            ? "Android needs permission to install this GitHub APK. Allow Capture the Canon to install unknown apps, then come back and tap Update."
            : phase === "installing"
              ? "Android is ready to install the new APK over this one. Keep the current app; your save is left in place."
              : phase === "downloading"
                ? "Downloading the latest APK from GitHub."
                : `A newer sideload build is on GitHub (${manifest.versionName}). You are on ${currentName || "an older build"}.`}
        </p>
        {phase === "downloading" || phase === "installing" ? <Progress progress={progress} /> : null}
        {error ? <p className="hint hint--warn">{error}</p> : null}
        <div className="row-actions">
          {phase === "need-permission" ? (
            <button type="button" className="btn" onClick={() => void onAllow()}>
              Allow installs
            </button>
          ) : phase === "error" ? (
            <button type="button" className="btn" onClick={() => void onRetry()}>
              Try again
            </button>
          ) : phase === "installing" ? (
            <button type="button" className="btn" disabled>
              Waiting on Android
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => void onUpdate()}>
              {busy ? "Downloading…" : "Update now"}
            </button>
          )}
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onLater}>
            Later
          </button>
        </div>
      </section>
    </div>
  );
}
