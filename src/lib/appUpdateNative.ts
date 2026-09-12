import { registerPlugin, WebPlugin, type PluginListenerHandle } from "@capacitor/core";
import { builtAppVersion } from "./appUpdate";

export type AppVersionInfo = {
  versionName: string;
  versionCode: number;
};

export type DownloadProgress = {
  received: number;
  total: number;
};

export interface AppUpdatePlugin {
  getVersion(): Promise<AppVersionInfo>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  fetchText(options: { url: string }): Promise<{ text: string }>;
  downloadAndInstall(options: { url: string }): Promise<void>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (progress: DownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

class AppUpdateWeb extends WebPlugin implements AppUpdatePlugin {
  async getVersion(): Promise<AppVersionInfo> {
    return builtAppVersion();
  }

  async canInstall(): Promise<{ allowed: boolean }> {
    return { allowed: false };
  }

  async openInstallSettings(): Promise<void> {}

  async fetchText(): Promise<{ text: string }> {
    throw this.unimplemented("App updates are Android-only.");
  }

  async downloadAndInstall(): Promise<void> {
    throw this.unimplemented("App updates are Android-only.");
  }
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>("AppUpdate", {
  web: () => new AppUpdateWeb(),
});
