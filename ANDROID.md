# Installing Michelangelo on Android (personal use)

Two ways, both reuse the same PWA — no app store, no fee, no review.

## Option A — Add to Home Screen (no build, works today)

1. Open the live site in **Chrome** on your phone:
   `https://pezzonovante7.github.io/Michelangelo/`
2. Sign in once.
3. Chrome menu (⋮) → **Add to Home screen** / **Install app**.

You get a full-screen icon with the Nord maskable icon, offline shell, and the
"Begin today" long-press shortcut. It loads from GitHub Pages, so it needs
occasional internet (Supabase data already requires that anyway).

## Option B — Real sideloaded .apk (TWA via PWABuilder)

**Android Studio is NOT required.** PWABuilder builds the signed package in the
cloud; you just download and sideload it.

1. Go to **https://www.pwabuilder.com** and enter the site URL above.
2. It analyses the manifest/service worker → click **Package for stores → Android**.
3. Choose the **APK** (for sideloading) — keep the generated **signing key** safe;
   you need the same key to install future updates without uninstalling.
4. Download the `.apk`, transfer it to your phone (USB, Drive, etc.).
5. On the phone: Settings → allow **Install unknown apps** for your Files/Drive app,
   then tap the `.apk` to install.

### Optional: hide the address bar (Digital Asset Links)

A TWA shows a thin URL bar at the top until the site verifies it owns the app.
To remove it:

1. From the PWABuilder package, note the signing key's **SHA-256 fingerprint**
   (PWABuilder shows an `assetlinks.json` for you).
2. Commit it to the repo at `.well-known/assetlinks.json` so it's served at
   `https://pezzonovante7.github.io/Michelangelo/.well-known/assetlinks.json`.

> Ask Claude to wire this up once you have the fingerprint — it's a 2-minute step.

## Notes

- GitHub OAuth + Supabase work unchanged in both options (the app loads its real
  web origin).
- The icon, theme color, name, and shortcuts all come from `manifest.json`, so any
  visual tweak to the PWA carries straight into the Android app.
