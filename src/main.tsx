import { Capacitor } from "@capacitor/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
}

async function boot() {
  if (import.meta.env.DEV) {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo === "finale" || demo === "finale-offer" || demo === "finale-done" || demo === "finale-loss") {
      const { installFinaleDemo } = await import("./lib/seasonDemo");
      installFinaleDemo(demo);
    }
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
