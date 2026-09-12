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

On a phone, open that URL in Chrome. If Android blocks the install, allow **Install unknown apps** for Chrome, then install. Open **Capture the Canon** from the launcher.

This is a **sideload-signed** APK (fine for installing from GitHub; not a Play Store build). Every push to `main` rebuilds it, commits `releases/ChampManager.apk`, and uploads a copy under **Actions → Android APK → Artifacts**.

Once that APK is on the phone, later builds do not need a zip from Actions. Open the app and it checks GitHub for a newer APK. Tap **Update now**, allow installs from Capture the Canon if Android asks, and the new build installs over the current one. A save already on the phone is kept.

Android will only update an existing install if the new APK is signed with the **same key**. Older GitHub zips were signed with a fresh debug key on every CI run, so the phone treated each zip as a different app and asked you to uninstall first. Builds from this repo now share one sideload key, and the version code goes up with each commit, so GitHub updates install in place.

If you already have an older build installed, uninstall **once**, install this APK, and later GitHub updates should apply without wiping the app.

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

## Play in the browser (iPhone or extra Android)

The hosted game is at **https://roryol.github.io/ChampManager/**.

On a phone, open that exact URL in **Chrome** (Android) or **Safari** (iPhone), then Add to Home Screen. It should open full-screen as Capture the Canon, not the github.io homepage.

If an old home-screen shortcut still opens `github.io` with a browser banner, delete that shortcut and add it again after this page has refreshed. Do not add the shortcut from `https://roryol.github.io/` itself.
