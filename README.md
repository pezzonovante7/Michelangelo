# Michelangelo v2 — 6-Day Hybrid Training Hub

A mobile-first training app for a structured strength + boxing program. Tracks set-by-set lifting, phased boxing sessions, McGill Big 3, and Bryan Johnson's longevity pillars.

**Hosted on GitHub Pages · Backend powered by Supabase · Auth via GitHub**

## Weekly Schedule

| Day | Session |
|-----|---------|
| Monday | Strength A — Push |
| Tuesday | Boxing A — Technique + Zone 2 |
| Wednesday | Strength B — Pull + Balance |
| Thursday | Boxing B — Power + VO₂ Max |
| Friday | Strength C — Legs + Posterior |
| Saturday | Boxing C — Endurance + Mobility |
| Sunday | Rest / Active Recovery |

## Setup (One-Time)

### 1. Supabase Project

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the **SQL Editor**
3. Copy **Project URL** and **anon key** from **Project Settings → API**

### 2. GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. **New OAuth App**
   - **Application name:** Michelangelo
   - **Homepage URL:** `https://pezzonovante7.github.io/Michelangelo/`
   - **Authorization callback URL:** `https://fwqaxksjmelgckexidmz.supabase.co/auth/v1/callback`
     (use your own `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`)
3. Copy the **Client ID** and generate a **Client Secret**

### 3. Enable GitHub in Supabase

1. **Authentication → Providers → GitHub** → Enable
2. Paste your GitHub **Client ID** and **Client Secret**
3. **Authentication → URL Configuration**
   - **Site URL:** `https://pezzonovante7.github.io/Michelangelo/`
   - **Redirect URLs** (add both):
     - `http://localhost:8765`
     - `https://pezzonovante7.github.io/Michelangelo/`

### 4. Configure the App

```bash
cp js/config.example.js js/config.js
# Edit with your Supabase URL, anon key, and GitHub username
```

`ALLOWED_GITHUB_USERNAME` locks the app to your GitHub account only.

### 5. Run Locally

```bash
python -m http.server 8765
```

Open `http://localhost:8765` → **Sign in with GitHub**

### 6. Deploy to GitHub Pages

Push to `main`. Enable Pages in repo Settings → Pages → Source: `main` branch.

### 7. Install on Your Phone (instant launch)

Michelangelo is a **PWA** — once installed it opens full-screen from your home screen with cached app shell for near-instant load.

**Android (Chrome)**

1. Open `https://pezzonovante7.github.io/Michelangelo/`
2. First visit: enter Supabase URL + anon key (saved in browser storage)
3. Sign in with GitHub once
4. Tap **Install** when the banner appears, or Chrome menu → **Install app** / **Add to Home screen**
5. Optional: long-press the home-screen icon → **Begin today** shortcut jumps straight into today's session

**iPhone (Safari)**

1. Open the same URL in Safari
2. Complete setup + GitHub sign-in
3. Share button → **Add to Home Screen**
4. Launch from the Michelangelo icon — opens standalone without Safari UI

**Tips for gym use**

- Open the installed app once on Wi-Fi so the service worker caches JS, HTML, and icons
- Session drafts save locally if signal drops; sync when back online
- Auth session persists — you won't need to sign in every visit

## Project Structure

```
Michelangelo/
├── index.html
├── manifest.json
├── sw.js
├── icons/
├── js/
│   ├── app.js
│   ├── program.js
│   ├── db.js
│   ├── progression.js
│   └── config.example.js
└── supabase/
    └── schema.sql
```

## Features

- **GitHub sign-in** — one click, no passwords
- **Personal lock** — optional username restriction in config
- **PWA install** — home-screen icon, standalone mode, offline app shell
- **Day-driven calendar** — app knows today's session
- **Set-by-set strength logging** with ghost values from last session
- **Phased boxing timers** — 3 distinct session types (A/B/C)
- **Rest timer** between strength sets
- **Longevity pillars dashboard**
- **Offline drafts** — localStorage if gym Wi-Fi drops

## Tech Stack

- **Frontend:** HTML, vanilla JS, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Auth:** GitHub OAuth
- **Hosting:** GitHub Pages

## Troubleshooting

**Stuck on "Loading" screen**

- Do **not** open `index.html` by double-clicking (file://). Use a local server: `python -m http.server 8765` then visit http://localhost:8765
- Disable ad blockers / privacy extensions (they commonly block cdn.jsdelivr.net which serves the Supabase client library).
- Check DevTools Console + Network tab for failed requests to jsdelivr.net or supabase.co.
- The app now dynamically imports the Supabase library (instead of top-level static import) + shows hints after a few seconds and better error screens to avoid being permanently stuck.
- If using the installed PWA, try "Clear site data" or uninstall/re-add the PWA after fixing network/adblock issues.
- For the public hosted demo (GitHub Pages), only the configured GitHub user can sign in. Everyone else sees an access denied message after OAuth (this is intentional).

**Can't sign in or queries fail after setup**

- Make sure you ran `supabase/schema.sql` in your Supabase project's SQL Editor.
- Confirm GitHub provider is enabled in Supabase Auth and the OAuth app callback URLs match.
- Check that `ALLOWED_GITHUB_USERNAME` in `js/config.js` (or the value saved during setup) matches your GitHub username (or set it to `null` to allow any user).