The app is a late-90s Championship Manager-style game for the **TUS Clare Senior Hurling Championship**. You take charge of one of the 16 senior clubs. Squads come from 2026 championship line-outs; the matches themselves are simulated.

## How to play

1. Pick a club
2. Set your fifteen (tap two players to swap) and tactics
3. Go to the next championship match
4. Watch the commentary engine or skip to the result
5. Other ties in that round are simulated around you

## 2026 groups

- **Group 1:** Ballyea, Inagh-Kilnamona, Clonlara, St Joseph's Doora-Barefield
- **Group 2:** Éire Óg, Crusheen, Scariff, Broadford
- **Group 3:** Clooney-Quin, Cratloe, Feakle, O'Callaghan's Mills
- **Group 4:** Kilmaley, Newmarket-on-Fergus, Wolfe Tones, Sixmilebridge

The interface is built as an Android-first phone app. On a desktop browser it sits in a device frame. On a phone or in the APK it fills the screen.

## Install on your phone (APK)

Download the APK from GitHub (this is a direct file, not an in-chat link):

**https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk**

On a phone, open that URL in Chrome. If Android blocks the install, allow **Install unknown apps** for Chrome, then install. Open **ChampManager** from the launcher.

This is a debug-signed APK (fine for sideloading; not a Play Store build). Every push to `main` rebuilds it, commits `releases/ChampManager.apk`, and uploads a copy under **Actions → Android APK → Artifacts**.

To rebuild it locally (needs JDK 21 and the Android SDK):

```bash
npm install
npm run apk
```

That writes `ChampManager.apk` in the repo root.

## Run in a browser

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

A save is stored on the device. Use **Resign** to start again with another club.
