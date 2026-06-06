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

## Project Structure

```
Michelangelo/
├── index.html
├── js/
│   ├── app.js
│   ├── program.js
│   ├── db.js
│   └── config.example.js
└── supabase/
    └── schema.sql
```

## Features

- **GitHub sign-in** — one click, no passwords
- **Personal lock** — optional username restriction in config
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