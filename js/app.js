import {
  WEEKLY_SCHEDULE, STRENGTH_PROGRAM, BOXING_PROGRAM, PILLARS,
  MCGILL_ITEMS, MOBILITY_ITEMS,
  getDayKey, getDayInfo, formatDate, formatDisplayDate, getWeekDates, formatTime,
} from './program.js';

import {
  getTodayTarget, getSetProgressStatus,
  getExercisePRs, getNextSessionAdvice, formatLastSession,
} from './progression.js';

import {
  initClient, loadConfig, saveConfig, signInWithGitHub, signOut, getSession, onAuthChange,
  getGitHubUsername, getWeekSessions, getSessionByDate, getLastStrengthSession,
  upsertSession, completeSession, upsertStrengthSets, upsertBoxingPhases,
  saveDraft, loadDraft, clearDraft,
} from './db.js';

// ── State ─────────────────────────────────────────────

let currentUser = null;
let allowedGitHub = null;
let authError = '';
let weekOffset = 0;
let activeSession = null;

// Which screen the user is currently on: 'auth' | 'setup' | 'home' | 'session' | 'rest'.
// User-initiated navigation (tapping a day, Back, week arrows) is authoritative and
// always renders. Background events (auth callbacks, the initial-session load, the
// "online" event, the week-data fetch) may ONLY repaint the view they belong to — they
// must never replace a screen the user has navigated to. This is the single rule that
// keeps a trailing auth/network event from wiping out an open session.
let currentView = null;
const inSession = () => currentView === 'session' || currentView === 'rest';
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let restInterval = null;
let restSeconds = 0;
let restActive = false;
let restTarget = null;

const $ = (sel) => document.querySelector(sel);
const app = $('#app');
const THEME_KEY = 'michelangelo_theme';
const INSTALL_DISMISSED_KEY = 'michelangelo_install_dismissed';
let deferredInstallPrompt = null;

// Event delegation on the persistent #app container.
// This is much more reliable than attaching listeners to buttons after every innerHTML replace
// (especially across PWA updates, service worker caching, and multiple paints).
function setupHomeDelegation() {
  if (!app) return;
  app.addEventListener('click', (e) => {
    // Week navigation arrows
    const weekBtn = e.target.closest('[data-week-dir]');
    if (weekBtn) {
      const dir = parseInt(weekBtn.getAttribute('data-week-dir'), 10);
      console.log('[Michelangelo] week nav click', dir);
      window._changeWeek?.(dir);
      return;
    }

    // Calendar day tiles OR the "Begin Session" button
    const dayBtn = e.target.closest('[data-date][data-day-key]');
    if (dayBtn) {
      const dateStr = dayBtn.getAttribute('data-date');
      const dayKey = dayBtn.getAttribute('data-day-key');
      console.log('[Michelangelo] open-day click', { dateStr, dayKey });
      try {
        window._openDay?.(dateStr, dayKey);
      } catch (err) {
        console.error('[Michelangelo] error calling _openDay', err);
      }
      return;
    }

    // Sign out in home header
    const signOutBtn = e.target.closest('.sign-out');
    if (signOutBtn) {
      console.log('[Michelangelo] sign-out click');
      window._signOut?.();
      return;
    }
  });
}
setupHomeDelegation();

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function clearLaunchParams() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('action') && !url.searchParams.has('source')) return;
  url.searchParams.delete('action');
  url.searchParams.delete('source');
  const qs = url.searchParams.toString();
  window.history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : ''));
}

async function maybeOpenToday() {
  if (new URLSearchParams(window.location.search).get('action') !== 'today') return;
  clearLaunchParams();
  const today = new Date();
  const todayKey = getDayKey(today);
  if (todayKey === 'rest') return;
  await window._openDay(formatDate(today), todayKey);
}

function showInstallBanner() {
  if (document.querySelector('.install-banner') || isStandalone()) return;
  const banner = document.createElement('div');
  banner.className = 'install-banner panel';
  banner.innerHTML = `
    <div class="install-row">
      <div>
        <p class="label mb-1">Install app</p>
        <p class="install-copy">Opens instantly from your home screen — no browser chrome.</p>
      </div>
      <div class="install-actions">
        <button onclick="window._dismissInstall()" class="sign-out">Later</button>
        <button onclick="window._installApp()" class="btn install-btn">Install</button>
      </div>
    </div>`;
  app.prepend(banner);
}

function tryShowInstallBanner() {
  if (deferredInstallPrompt && currentUser && !localStorage.getItem(INSTALL_DISMISSED_KEY)) {
    showInstallBanner();
  }
}

window._installApp = async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.querySelector('.install-banner')?.remove();
};

window._dismissInstall = () => {
  localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  document.querySelector('.install-banner')?.remove();
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  tryShowInstallBanner();
});

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#2e3440' : '#eceff4';
}

function themeToggleLabel() {
  return getTheme() === 'light' ? 'Dark' : 'Light';
}

window._toggleTheme = () => {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
  if (currentUser) renderHome();
  else if (document.querySelector('.theme-toggle')) {
    document.querySelectorAll('.theme-toggle').forEach(el => {
      el.textContent = themeToggleLabel();
    });
  }
};

function headerActions(extra = '') {
  return `
    <div class="header-actions">
      <div class="header-row">
        ${currentUser?.user_metadata?.avatar_url
          ? `<img src="${currentUser.user_metadata.avatar_url}" class="avatar" alt="">`
          : ''}
        <button onclick="window._toggleTheme()" class="theme-toggle">${themeToggleLabel()}</button>
      </div>
      ${extra}
    </div>`;
}

// ── Boot ──────────────────────────────────────────────

async function boot() {
  const config = await loadConfig();
  allowedGitHub = config?.allowedGitHub ?? null;

  const client = await initClient();
  if (!client) {
    await renderSetup();
    return;
  }

  if (new URLSearchParams(window.location.search).get('code')) {
    app.innerHTML = '<div class="panel text-center" style="margin-top:5rem"><p class="loading-pulse">Signing in</p></div>';
  }

  // supabase-js fires this callback repeatedly: INITIAL_SESSION on subscribe, then
  // SIGNED_IN, TOKEN_REFRESHED, and again whenever the tab regains focus. We only act
  // on genuine transitions, and never while the user is inside a session/rest screen.
  onAuthChange(async (session) => {
    const user = session?.user ?? null;
    if (user && !(await verifyUser(user))) {
      currentUser = null;
      renderAuth();
      return;
    }
    authError = '';
    const wasSignedIn = !!currentUser;
    currentUser = user;
    if (user && !wasSignedIn && !inSession()) {
      await renderHome();
      await maybeOpenToday();
    } else if (!user && wasSignedIn) {
      renderAuth();
    }
    // Same user, repeat event (refresh/focus): do nothing — never clobber the view.
  });

  // Resolve the initial auth state once (this also completes the OAuth code exchange).
  try {
    const session = await getSession();
    if (session?.user && !(await verifyUser(session.user))) {
      currentUser = null;
      renderAuth();
      return;
    }
    currentUser = session?.user ?? null;
  } catch {
    renderAuth('GitHub sign-in failed. Try again.');
    return;
  }

  // Initial paint. By the time this resolves the auth callback may have already raced
  // ahead and rendered home, or the user may have navigated — so only paint if nothing
  // else has taken the screen.
  if (currentUser) {
    if (!inSession() && currentView !== 'home') {
      await renderHome();
      await maybeOpenToday();
    }
  } else if (!inSession()) {
    renderAuth();
  }

  // Reconnecting should refresh the home data, but must not yank the user out of a session.
  window.addEventListener('online', () => {
    if (currentUser && currentView === 'home') renderHome();
  });
}

async function verifyUser(user) {
  if (!allowedGitHub) return true;
  const username = getGitHubUsername(user);
  if (username === allowedGitHub) return true;
  authError = `Access denied. This app is locked to @${allowedGitHub}.`;
  await signOut();
  return false;
}

// ── Setup (missing config.js) ─────────────────────────

async function renderSetup() {
  currentView = 'setup';
  const existing = await loadConfig();
  const preUrl = existing?.url || '';
  const preKey = existing?.key || '';

  app.innerHTML = `
    <div class="panel">
      <div class="flex justify-between items-center mb-1">
        <p class="label">Setup</p>
        <button onclick="window._toggleTheme()" class="theme-toggle">${themeToggleLabel()}</button>
      </div>
      <h2 class="display" style="font-size:1.5rem;margin:0 0 0.5rem">Connect Supabase</h2>
      <p class="muted" style="font-size:0.75rem;margin-bottom:1.5rem">One-time. Project Settings → API. If you already have config.js but still see this, an ad blocker or network may be blocking the Supabase JS library (cdn.jsdelivr.net).</p>
      <label class="label">Project URL</label>
      <input id="setupUrl" type="url" placeholder="https://xxxxx.supabase.co" class="input mb-1">
      <label class="label mt-2">Anon Key</label>
      <input id="setupKey" type="text" placeholder="eyJhbG..." class="input mb-1">
      <p id="setupError" class="status-error hidden"></p>
      <button onclick="window._saveSetup()" class="btn mt-2">Connect</button>
      <a href="https://supabase.com/dashboard" target="_blank" class="label" style="display:block;text-align:center;margin-top:1.25rem;text-decoration:none">Create project →</a>
    </div>`;

  // Prefill safely (avoids " in values breaking attribute)
  const urlInput = $('#setupUrl');
  const keyInput = $('#setupKey');
  if (urlInput) urlInput.value = preUrl;
  if (keyInput) keyInput.value = preKey;
}

window._saveSetup = async () => {
  const url = $('#setupUrl').value.trim();
  const key = $('#setupKey').value.trim();
  const err = $('#setupError');
  if (!url || !key) {
    err.classList.remove('hidden');
    err.textContent = 'Both fields are required.';
    return;
  }
  saveConfig(url, key);
  try {
    await boot();
  } catch (e) {
    err.classList.remove('hidden');
    err.textContent = 'Connection failed — check URL and key.';
    localStorage.removeItem('michelangelo_config');
  }
};

// ── Auth ──────────────────────────────────────────────

function renderAuth(errorMsg = '') {
  currentView = 'auth';
  const msg = errorMsg || authError;
  app.innerHTML = `
    <div class="panel text-center" style="margin-top:3rem">
      <h1 class="header-title" style="font-size:2.5rem;margin-bottom:0.25rem">Michelangelo</h1>
      <p class="label mb-2">Training Protocol</p>
      ${msg ? `<p class="status-error">${msg}</p>` : ''}
      <p class="muted" style="font-size:0.8rem;margin:1.5rem 0 2rem">Personal performance log.</p>
      <button onclick="window._signInGitHub()" class="btn-github">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Continue with GitHub
      </button>
      <button onclick="window._toggleTheme()" class="theme-toggle" style="margin-top:1.25rem">${themeToggleLabel()} mode</button>
      ${allowedGitHub ? `<p class="dim" style="font-size:0.6rem;margin-top:0.75rem;letter-spacing:0.1em">@${allowedGitHub}</p>` : ''}
    </div>`;
}

window._signInGitHub = async () => {
  const { error } = await signInWithGitHub();
  if (error) renderAuth(error.message);
};

// ── Home / Calendar ───────────────────────────────────

async function renderHome() {
  currentView = 'home';
  const today = new Date();
  const weekDates = getWeekDates(new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7));
  const startDate = formatDate(weekDates[0]);
  const endDate = formatDate(weekDates[6]);

  const todayKey = getDayKey(today);
  const todayInfo = getDayInfo(todayKey);

  // Paint immediately (no network) so we never stick on the loading screen.
  // Data for completed days + pillars will populate shortly after.
  function paint(sessions = []) {
    const completedMap = {};
    sessions.forEach(s => {
      if (s.status === 'completed') completedMap[`${s.session_date}_${s.day_key}`] = true;
    });
    const pillars = computePillars(sessions);

    app.innerHTML = `
      <header class="header">
        <div>
          <h1 class="header-title">Michelangelo</h1>
          <p class="header-date">${formatDisplayDate(today)}</p>
        </div>
        ${headerActions('<button class="sign-out">Exit</button>')}
      </header>

      <div class="week-nav">
        <button data-week-dir="-1">‹</button>
        <span class="label">Week</span>
        <button data-week-dir="1">›</button>
      </div>

      <div class="week-strip">
        ${weekDates.map(d => {
          const key = getDayKey(d);
          const info = getDayInfo(key);
          const dateStr = formatDate(d);
          const done = completedMap[`${dateStr}_${key}`];
          const isToday = formatDate(d) === formatDate(today);
          return `
            <button data-date="${dateStr}" data-day-key="${key}"
              class="day ${isToday ? 'is-today' : ''} ${done ? 'is-done' : ''}">
              <span class="day-letter">${d.toLocaleDateString('en', { weekday: 'narrow' })}</span>
              <span class="day-code">${info.code}</span>
              <span class="day-dot"></span>
            </button>`;
        }).join('')}
      </div>

      <div class="panel panel-hero">
        <p class="label mb-1">Today</p>
        <h2 class="display" style="font-size:1.35rem;margin:0">${todayInfo.label}</h2>
        ${todayKey === 'rest'
          ? '<p class="muted" style="font-size:0.8rem;margin-top:0.75rem">Active recovery — Zone 2 walk, mobility, McGill Big 3.</p>'
          : `<button data-date="${formatDate(today)}" data-day-key="${todayKey}" class="btn mt-2">Begin Session</button>`
        }
      </div>

      <div class="panel">
        <p class="label mb-2">Longevity Pillars</p>
        ${Object.entries(PILLARS).map(([key, p]) => {
          const pct = pillars[key] || 0;
          return `
            <div class="pillar">
              <div class="pillar-head">
                <span>${p.label}</span>
                <span class="dim">${pct}%</span>
              </div>
              <div class="pillar-track"><div class="pillar-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')}
      </div>`;

    tryShowInstallBanner();
  }

  paint([]); // show UI instantly

  // Load data in background; re-paint when ready (or stay with empty if offline/slow).
  try {
    const sessions = await getWeekSessions(currentUser.id, startDate, endDate);
    // Only refresh if the user is still on the home screen — if they navigated into a
    // session while this was loading, painting now would clobber it.
    if (currentView === 'home') {
      paint(sessions);
    }
  } catch {
    /* offline or error — UI already visible with zeros */
  }
}

function computePillars(sessions) {
  const completed = sessions.filter(s => s.status === 'completed');
  const total = completed.length || 1;
  const counts = { strength: 0, zone2: 0, vo2: 0, mobility: 0, balance: 0 };

  completed.forEach(s => {
    if (s.day_key.startsWith('strength')) counts.strength++;
    if (s.day_key === 'boxing_a' || s.day_key === 'boxing_c') counts.zone2++;
    if (s.day_key === 'boxing_b') counts.vo2++;
    if (s.day_key.startsWith('boxing')) { counts.mobility++; counts.balance++; }
    if (s.day_key === 'strength_b') counts.balance++;
  });

  const targets = { strength: 3, zone2: 3, vo2: 1, mobility: 6, balance: 6 };
  const result = {};
  for (const [k, target] of Object.entries(targets)) {
    result[k] = Math.min(100, Math.round((counts[k] / target) * 100));
  }
  return result;
}

window._goHome = () => { stopRestTimer(); renderHome(); };
window._changeWeek = (dir) => { weekOffset += dir; renderHome(); };
window._signOut = async () => { await signOut(); renderAuth(); };
window._updateNotes = (val) => { if (activeSession) { activeSession.notes = val; saveDraft(activeSession); } };

window._openDay = async (dateStr, dayKey) => {
  // Claim the view synchronously, before any await, so a background repaint that
  // fires while the session is loading cannot grab the screen first.
  currentView = 'session';
  try {
    if (dayKey === 'rest') {
      renderRestDay(dateStr);
      return;
    }

    const info = getDayInfo(dayKey);
    if (!info) {
      console.error('[Michelangelo] Unknown dayKey in _openDay:', dayKey);
      renderHome();
      return;
    }

    if (info.type === 'strength') {
      await renderStrengthSession(dateStr, dayKey);
    } else {
      await renderBoxingSession(dateStr, dayKey);
    }
  } catch (err) {
    console.error('[Michelangelo] _openDay failed', err);
    // Fall back to home so user isn't stuck
    try { renderHome(); } catch {}
  }
};

// ── Rest Day ──────────────────────────────────────────

function renderRestDay(dateStr) {
  currentView = 'rest';
  app.innerHTML = `
    <button onclick="window._goHome()" class="back">← Back</button>
    <div class="panel panel-hero text-center">
      <p class="label mb-1">Recovery</p>
      <h2 class="display" style="font-size:1.75rem;margin:0 0 0.25rem">Rest Day</h2>
      <p class="muted" style="font-size:0.75rem;margin-bottom:1.5rem">${formatDisplayDate(new Date(dateStr + 'T12:00:00'))}</p>
      <div style="text-align:left">
        <div class="list-item"><strong>Zone 2 walk</strong> — 20–40 min</div>
        <div class="list-item"><strong>Mobility</strong> — light stretching</div>
        <div class="list-item"><strong>McGill Big 3</strong> — spine hygiene</div>
        <div class="list-item"><strong>Recovery</strong> — sleep & protein</div>
      </div>
    </div>`;
}

// ── Strength Session ──────────────────────────────────

async function renderStrengthSession(dateStr, dayKey) {
  const program = STRENGTH_PROGRAM[dayKey];
  let existing = null;
  let lastSession = null;

  try {
    existing = await getSessionByDate(currentUser.id, dateStr, dayKey);
    lastSession = await getLastStrengthSession(currentUser.id, dayKey, dateStr);
  } catch { /* offline — use draft */ }

  const draft = loadDraft();
  if (draft?.dayKey === dayKey && draft?.dateStr === dateStr) {
    activeSession = draft;
    if (!activeSession.lastSession) activeSession.lastSession = lastSession;
  } else {
    activeSession = {
      dateStr, dayKey, step: 'prep',
      mcgillPre: existing?.mcgill_pre ?? false,
      warmupDone: existing?.warmup_done ?? false,
      mobilityDone: existing?.mobility_done ?? false,
      mcgillPost: existing?.mcgill_post ?? false,
      cooldownDone: existing?.cooldown_done ?? false,
      sessionRpe: existing?.session_rpe ?? 5,
      notes: existing?.notes ?? '',
      sessionId: existing?.id ?? null,
      lastSession,
      sets: buildInitialSets(program, existing, lastSession),
    };
  }

  activeSession.lastMap = buildLastMap(activeSession.lastSession);
  renderStrengthStep(program);
}

function buildLastMap(lastSession) {
  const map = {};
  lastSession?.strength_sets?.forEach(s => {
    map[`${s.exercise_name}_${s.set_number}`] = s;
  });
  return map;
}

function getLastSetsForExercise(exerciseName) {
  return activeSession?.lastSession?.strength_sets?.filter(s => s.exercise_name === exerciseName) || [];
}

function buildInitialSets(program, existing, lastSession) {
  const lastMap = {};
  if (lastSession?.strength_sets) {
    lastSession.strength_sets.forEach(s => {
      lastMap[`${s.exercise_name}_${s.set_number}`] = s;
    });
  }
  const existingMap = {};
  if (existing?.strength_sets) {
    existing.strength_sets.forEach(s => {
      existingMap[`${s.exercise_name}_${s.set_number}`] = s;
    });
  }

  const sets = [];
  program.exercises.forEach(ex => {
    for (let i = 1; i <= ex.sets; i++) {
      const key = `${ex.name}_${i}`;
      const exData = existingMap[key] || lastMap[key];
      sets.push({
        exercise: ex.name,
        setNumber: i,
        weight: exData?.weight_kg ?? '',
        reps: exData?.reps ?? '',
        completed: exData?.completed ?? false,
        isGhost: !existingMap[key] && !!lastMap[key],
        rest: ex.rest,
        repRange: ex.repRange,
      });
    }
  });
  return sets;
}

function renderStrengthStep(program) {
  const s = activeSession;
  if (s.step === 'prep') {
    const lastDate = formatLastSession(s.lastSession?.session_date);
    const targets = program.exercises.map(ex => {
      const target = getTodayTarget(getLastSetsForExercise(ex.name), ex.repRange);
      return `<div class="prog-target"><span class="prog-target-label">${ex.name}</span><span class="prog-target-detail">${target.detail}</span></div>`;
    }).join('');

    app.innerHTML = strengthShell(program, `
      ${s.lastSession ? `
        <div class="prog-banner">
          <div class="prog-banner-title">Progressive Overload · Last ${lastDate}</div>
          <div class="prog-banner-sub">Beat last session — add weight when you hit top reps, otherwise add reps.</div>
        </div>
        ${targets}` : `
        <div class="prog-banner">
          <div class="prog-banner-title">Progressive Overload</div>
          <div class="prog-banner-sub">First session — log every set. Next time, the app sets your targets.</div>
        </div>`}
      <p class="label mb-2 mt-2">Pre-Session</p>
      ${checklistItem('mcgillPre', 'McGill Big 3', MCGILL_ITEMS)}
      ${checklistItem('warmupDone', 'Warm-up', ['5–10 min light cardio + dynamic stretches'])}
      ${checklistItem('mobilityDone', 'Mobility', MOBILITY_ITEMS)}
      <button onclick="window._strengthNext('workout')" class="btn mt-2"
        ${!(s.mcgillPre && s.warmupDone && s.mobilityDone) ? 'disabled' : ''}>
        Begin Workout
      </button>`);
    bindChecklist();
    return;
  }

  if (s.step === 'workout') {
    const exercises = program.exercises;
    app.innerHTML = strengthShell(program, `
      ${exercises.map(ex => {
          const exSets = s.sets.filter(set => set.exercise === ex.name);
          const target = getTodayTarget(getLastSetsForExercise(ex.name), ex.repRange);
          return `
            <div class="exercise">
              <div class="exercise-head">
                <span class="exercise-name">${ex.name}</span>
                <span class="exercise-meta">${ex.sets}×${ex.repRange}</span>
              </div>
              <div class="prog-target" style="margin-bottom:0.75rem">
                <span class="prog-target-label">${target.label}</span>
                <span class="prog-target-detail">${target.detail}</span>
              </div>
              ${exSets.map(set => {
                const status = getSetProgressStatus(set, s.lastMap);
                const isPr = status === 'pr';
                return `
                <div class="set-grid ${isPr ? 'is-pr' : ''}">
                  <span class="set-num">${set.setNumber}</span>
                  <input type="number" step="any" placeholder="${set.isGhost ? set.weight : 'kg'}" value="${set.isGhost ? '' : set.weight}"
                    class="input input-sm" data-ex="${set.exercise}" data-set="${set.setNumber}" data-field="weight"
                    onchange="window._updateSet(this)">
                  <input type="number" step="1" placeholder="${set.isGhost ? set.reps : 'reps'}" value="${set.isGhost ? '' : set.reps}"
                    class="input input-sm" data-ex="${set.exercise}" data-set="${set.setNumber}" data-field="reps"
                    onchange="window._updateSet(this)">
                  <button onclick="window._toggleSetComplete('${set.exercise}', ${set.setNumber})"
                    class="btn-set ${set.completed ? 'done' : ''}">✓</button>
                </div>`;
              }).join('')}
            </div>`;
        }).join('')}
      <button onclick="window._strengthNext('post')" class="btn mt-2">Finish Exercises</button>
      ${restTimerHTML()}`);
    syncRestTimerUI();
    return;
  }

  if (s.step === 'post') {
    const prs = getExercisePRs(s.sets, s.lastSession);
    const advice = getNextSessionAdvice(s.sets, program.exercises, s.lastSession);

    app.innerHTML = strengthShell(program, `
      ${prs.length ? `
        <p class="label mb-1">Personal Records</p>
        <div class="pr-list">
          ${prs.map(p => `<div class="pr-item"><strong>${p.exercise}</strong> — ${p.msg}</div>`).join('')}
        </div>` : ''}
      ${advice.length ? `
        <p class="label mb-1">Next Session</p>
        <div class="advice-list">
          ${advice.map(a => `<div class="advice-item"><span>${a.exercise}</span> — ${a.advice}</div>`).join('')}
        </div>` : ''}
      <p class="label mb-2">Post-Session</p>
      ${checklistItem('cooldownDone', 'Cool-down', ['Light cardio taper + stretching'])}
      ${checklistItem('mcgillPost', 'McGill Big 3', MCGILL_ITEMS)}
      <div class="mt-2 mb-1">
        <label class="label">Session RPE</label>
        <div class="rpe-row">
          <input type="range" min="1" max="10" value="${s.sessionRpe}"
            oninput="window._updateRpe(this.value); this.nextElementSibling.textContent = this.value">
          <span class="rpe-val">${s.sessionRpe}</span>
        </div>
      </div>
      <textarea class="input" rows="2" placeholder="Session notes..."
        onchange="window._updateNotes(this.value)">${s.notes}</textarea>
      <button onclick="window._saveStrength()" class="btn mt-2">Complete & Sync</button>
      <p id="syncStatus" class="sync-status"></p>`);
    bindChecklist();
  }
}

function strengthShell(program, body) {
  return `
    <button onclick="window._goHome()" class="back">← Back</button>
    <div class="panel panel-hero">
      <p class="label">${program.subtitle}</p>
      <h2 class="display" style="font-size:1.35rem;margin:0.25rem 0 1.25rem">${program.title}</h2>
      ${body}
    </div>`;
}

function checklistItem(key, title, items) {
  const checked = activeSession[key] ? 'checked' : '';
  return `
    <label class="check">
      <input type="checkbox" data-check="${key}" ${checked}>
      <div>
        <span class="check-title">${title}</span>
        <span class="check-sub">${items.join(' · ')}</span>
      </div>
    </label>`;
}

function bindChecklist() {
  document.querySelectorAll('[data-check]').forEach(el => {
    el.addEventListener('change', () => {
      activeSession[el.dataset.check] = el.checked;
      saveDraft(activeSession);
      if (activeSession.step === 'prep') {
        const dk = activeSession.dayKey;
        if (STRENGTH_PROGRAM[dk]) {
          renderStrengthStep(STRENGTH_PROGRAM[dk]);
        } else if (BOXING_PROGRAM[dk]) {
          renderBoxingStep(BOXING_PROGRAM[dk]);
        }
      }
    });
  });
}

window._strengthNext = (step) => {
  if (step === 'post') stopRestTimer();
  activeSession.step = step;
  saveDraft(activeSession);
  renderStrengthStep(STRENGTH_PROGRAM[activeSession.dayKey]);
};

window._updateSet = (el) => {
  const set = activeSession.sets.find(s => s.exercise === el.dataset.ex && s.setNumber === +el.dataset.set);
  if (set) {
    set[el.dataset.field] = el.value;
    set.isGhost = false;
    saveDraft(activeSession);
  }
};

window._toggleSetComplete = (exercise, setNumber) => {
  const set = activeSession.sets.find(s => s.exercise === exercise && s.setNumber === setNumber);
  if (!set) return;

  const wasCompleted = set.completed;
  set.completed = !set.completed;
  saveDraft(activeSession);

  if (set.completed && !wasCompleted) {
    const next = getNextSet(exercise, setNumber);
    if (next) startRestTimer(set.rest, next);
    else stopRestTimer();
  } else if (!set.completed) {
    stopRestTimer();
  }

  renderStrengthStep(STRENGTH_PROGRAM[activeSession.dayKey]);
};

function getNextSet(exercise, setNumber) {
  const sets = activeSession.sets;
  const idx = sets.findIndex(s => s.exercise === exercise && s.setNumber === setNumber);
  return idx >= 0 && idx < sets.length - 1 ? sets[idx + 1] : null;
}

function restTimerHTML() {
  return `
    <div id="restTimerBar" class="rest-bar hidden">
      <p id="restTimerLabel" class="label mb-1">Rest</p>
      <div class="flex justify-between items-center">
        <div id="restTimerDisplay" class="timer">0:00</div>
        <div class="rest-actions">
          <button onclick="window._addRest(30)">+30s</button>
          <button onclick="window._skipRest()">Skip</button>
        </div>
      </div>
    </div>`;
}

function syncRestTimerUI() {
  const bar = document.getElementById('restTimerBar');
  if (!bar) return;
  if (restActive) {
    bar.classList.remove('hidden');
    bar.classList.toggle('done', restSeconds === 0);
    document.body.classList.add('has-rest-timer');
    const display = document.getElementById('restTimerDisplay');
    const label = document.getElementById('restTimerLabel');
    if (display) display.textContent = formatTime(restSeconds);
    if (label) {
      label.textContent = restSeconds === 0
        ? 'Rest complete — go!'
        : restTarget
          ? `Rest · next: ${restTarget.exercise} set ${restTarget.setNumber}`
          : 'Rest';
    }
  } else {
    bar.classList.add('hidden');
    document.body.classList.remove('has-rest-timer');
  }
}

function startRestTimer(seconds, nextSet) {
  stopRestTimer();
  restSeconds = seconds;
  restActive = true;
  restTarget = nextSet;
  syncRestTimerUI();
  restInterval = setInterval(() => {
    if (restSeconds > 0) {
      restSeconds--;
      syncRestTimerUI();
    } else {
      clearInterval(restInterval);
      restInterval = null;
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      syncRestTimerUI();
    }
  }, 1000);
}

function stopRestTimer() {
  clearInterval(restInterval);
  restInterval = null;
  restActive = false;
  restSeconds = 0;
  restTarget = null;
  document.body.classList.remove('has-rest-timer');
}

window._skipRest = () => { stopRestTimer(); syncRestTimerUI(); };
window._addRest = (extra) => {
  if (!restActive) return;
  restSeconds += extra;
  syncRestTimerUI();
};

window._updateRpe = (val) => { activeSession.sessionRpe = +val; saveDraft(activeSession); };

window._saveStrength = async () => {
  const status = $('#syncStatus');
  status.textContent = 'Syncing...';
  status.className = 'sync-status';

  try {
    const session = await upsertSession({
      id: activeSession.sessionId || undefined,
      user_id: currentUser.id,
      session_date: activeSession.dateStr,
      day_key: activeSession.dayKey,
      status: 'in_progress',
      mcgill_pre: activeSession.mcgillPre,
      mcgill_post: activeSession.mcgillPost,
      warmup_done: activeSession.warmupDone,
      cooldown_done: activeSession.cooldownDone,
      mobility_done: activeSession.mobilityDone,
      session_rpe: activeSession.sessionRpe,
      notes: activeSession.notes,
    });

    activeSession.sessionId = session.id;

    const setRows = activeSession.sets.map(s => ({
      session_id: session.id,
      exercise_name: s.exercise,
      set_number: s.setNumber,
      weight_kg: s.weight || null,
      reps: s.reps || null,
      completed: s.completed,
    }));
    await upsertStrengthSets(setRows);
    await completeSession(session.id, {
      mcgill_pre: activeSession.mcgillPre,
      mcgill_post: activeSession.mcgillPost,
      warmup_done: activeSession.warmupDone,
      cooldown_done: activeSession.cooldownDone,
      mobility_done: activeSession.mobilityDone,
      session_rpe: activeSession.sessionRpe,
      notes: activeSession.notes,
    });

    clearDraft();
    status.textContent = 'Synced';
    status.className = 'sync-status sync-ok';
    setTimeout(() => renderHome(), 1200);
  } catch (err) {
    saveDraft(activeSession);
    status.textContent = 'Saved offline';
    status.className = 'sync-status sync-warn';
  }
};

// ── Boxing Session ────────────────────────────────────

async function renderBoxingSession(dateStr, dayKey) {
  const program = BOXING_PROGRAM[dayKey];
  let existing = null;
  try {
    existing = await getSessionByDate(currentUser.id, dateStr, dayKey);
  } catch { /* offline */ }

  const draft = loadDraft();
  if (draft?.dayKey === dayKey && draft?.dateStr === dateStr) {
    activeSession = draft;
  } else {
    const phaseMap = {};
    existing?.boxing_phases?.forEach(p => { phaseMap[p.phase_key] = p; });

    activeSession = {
      dateStr, dayKey, step: 'prep',
      mcgillPre: existing?.mcgill_pre ?? false,
      mcgillPost: existing?.mcgill_post ?? false,
      warmupDone: existing?.warmup_done ?? false,
      sessionRpe: existing?.session_rpe ?? 5,
      notes: existing?.notes ?? '',
      sessionId: existing?.id ?? null,
      currentPhase: 0,
      phases: program.phases.map((p, i) => ({
        ...p,
        order: i,
        elapsed: phaseMap[p.key]?.elapsed_seconds ?? 0,
        rpe: phaseMap[p.key]?.rpe ?? 5,
        completed: phaseMap[p.key]?.completed ?? false,
        notes: phaseMap[p.key]?.notes ?? '',
      })),
    };
  }

  renderBoxingStep(program);
}

function renderBoxingStep(program) {
  const s = activeSession;
  if (s.step === 'prep') {
    app.innerHTML = boxingShell(program, `
      <p class="label mb-2">Pre-Session</p>
      ${checklistItem('mcgillPre', 'McGill Big 3', MCGILL_ITEMS)}
      ${checklistItem('warmupDone', 'Warm-up', ['Light shadow boxing + mobility'])}
      <div class="mt-2 mb-1">
        <p class="label mb-1">Phases</p>
        ${s.phases.map((p, i) => `
          <div class="overview-row">
            <span>${i + 1}. ${p.name}</span>
            <span class="overview-time">${formatTime(p.duration)}</span>
          </div>`).join('')}
      </div>
      <button onclick="window._boxingNext('workout')" class="btn mt-2"
        ${!(s.mcgillPre && s.warmupDone) ? 'disabled' : ''}>
        Start Session
      </button>`);
    bindChecklist();
    return;
  }

  if (s.step === 'workout') {
    const phase = s.phases[s.currentPhase];
    const remaining = Math.max(0, phase.duration - phase.elapsed);

    app.innerHTML = boxingShell(program, `
      <div class="text-center" style="margin-bottom:1.5rem">
        <p class="label">Phase ${s.currentPhase + 1} / ${s.phases.length}</p>
        <h3 class="display" style="font-size:1.25rem;margin:0.35rem 0 0.15rem">${phase.name}</h3>
        <p class="muted" style="font-size:0.65rem">${phase.hint}</p>
        <div id="timerDisplay" class="timer" style="margin:1.5rem 0">${formatTime(remaining)}</div>
        <div class="flex gap-3">
          <button onclick="window._toggleTimer()" id="timerBtn" class="btn flex-1">${timerRunning ? 'Pause' : 'Start'}</button>
          <button onclick="window._completePhase()" class="btn-ghost">Skip</button>
        </div>
      </div>
      <div class="rpe-row">
        <span class="label" style="width:2rem">RPE</span>
        <input type="range" min="1" max="10" value="${phase.rpe}"
          oninput="window._updatePhaseRpe(${s.currentPhase}, this.value); this.nextElementSibling.textContent = this.value">
        <span class="rpe-val">${phase.rpe}</span>
      </div>
      <div class="phase-track">
        ${s.phases.map((p, i) => `
          <div class="phase-seg ${i < s.currentPhase ? 'done' : ''} ${i === s.currentPhase ? 'active' : ''}"></div>
        `).join('')}
      </div>`);

    timerSeconds = remaining;
    return;
  }

  if (s.step === 'post') {
    app.innerHTML = boxingShell(program, `
      <p class="label mb-2">Complete</p>
      ${checklistItem('mcgillPost', 'McGill Big 3', MCGILL_ITEMS)}
      <div class="mt-2 mb-1">
        <label class="label">Session RPE</label>
        <div class="rpe-row">
          <input type="range" min="1" max="10" value="${s.sessionRpe}"
            oninput="window._updateRpe(this.value); this.nextElementSibling.textContent = this.value">
          <span class="rpe-val">${s.sessionRpe}</span>
        </div>
      </div>
      <textarea class="input" rows="2" placeholder="Session notes..."
        onchange="window._updateNotes(this.value)">${s.notes}</textarea>
      <button onclick="window._saveBoxing()" class="btn mt-2">Complete & Sync</button>
      <p id="syncStatus" class="sync-status"></p>`);
    bindChecklist();
  }
}

function boxingShell(program, body) {
  return `
    <button onclick="window._stopTimer(); window._goHome()" class="back">← Back</button>
    <div class="panel panel-hero">
      <p class="label">${program.subtitle}</p>
      <h2 class="display" style="font-size:1.35rem;margin:0.25rem 0 1.25rem">${program.title}</h2>
      ${body}
    </div>`;
}

window._boxingNext = (step) => {
  activeSession.step = step;
  saveDraft(activeSession);
  renderBoxingStep(BOXING_PROGRAM[activeSession.dayKey]);
};

window._updatePhaseRpe = (idx, val) => {
  activeSession.phases[idx].rpe = +val;
  saveDraft(activeSession);
};

window._toggleTimer = () => {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    $('#timerBtn').textContent = 'Resume';
  } else {
    timerRunning = true;
    $('#timerBtn').textContent = 'Pause';
    timerInterval = setInterval(() => {
      const phase = activeSession.phases[activeSession.currentPhase];
      if (timerSeconds > 0) {
        timerSeconds--;
        phase.elapsed = phase.duration - timerSeconds;
        $('#timerDisplay').textContent = formatTime(timerSeconds);
      } else {
        window._completePhase();
      }
    }, 1000);
  }
};

window._stopTimer = () => {
  clearInterval(timerInterval);
  timerRunning = false;
};

window._completePhase = () => {
  window._stopTimer();
  const phase = activeSession.phases[activeSession.currentPhase];
  phase.completed = true;
  phase.elapsed = phase.duration;

  if (activeSession.currentPhase < activeSession.phases.length - 1) {
    activeSession.currentPhase++;
    saveDraft(activeSession);
    renderBoxingStep(BOXING_PROGRAM[activeSession.dayKey]);
  } else {
    activeSession.step = 'post';
    saveDraft(activeSession);
    renderBoxingStep(BOXING_PROGRAM[activeSession.dayKey]);
  }
};

window._saveBoxing = async () => {
  const status = $('#syncStatus');
  status.textContent = 'Syncing...';

  try {
    const session = await upsertSession({
      id: activeSession.sessionId || undefined,
      user_id: currentUser.id,
      session_date: activeSession.dateStr,
      day_key: activeSession.dayKey,
      status: 'in_progress',
      mcgill_pre: activeSession.mcgillPre,
      mcgill_post: activeSession.mcgillPost,
      warmup_done: activeSession.warmupDone,
      session_rpe: activeSession.sessionRpe,
      notes: activeSession.notes,
    });

    const phaseRows = activeSession.phases.map(p => ({
      session_id: session.id,
      phase_key: p.key,
      phase_order: p.order,
      target_seconds: p.duration,
      elapsed_seconds: p.elapsed,
      rpe: p.rpe,
      notes: p.notes,
      completed: p.completed,
    }));
    await upsertBoxingPhases(phaseRows);
    await completeSession(session.id, {
      mcgill_pre: activeSession.mcgillPre,
      mcgill_post: activeSession.mcgillPost,
      warmup_done: activeSession.warmupDone,
      session_rpe: activeSession.sessionRpe,
      notes: activeSession.notes,
    });

    clearDraft();
    status.textContent = 'Synced';
    status.className = 'sync-status sync-ok';
    setTimeout(() => renderHome(), 1200);
  } catch (err) {
    saveDraft(activeSession);
    status.textContent = 'Saved offline';
    status.className = 'sync-status sync-warn';
  }
};

// ── Init ──────────────────────────────────────────────

boot().catch((err) => {
  console.error('Michelangelo boot failed:', err);
  const shell = document.getElementById('app');
  if (shell) {
    shell.innerHTML = `
      <div class="panel text-center" style="margin-top: 5rem;">
        <p class="status-error">Failed to start the app.</p>
        <p class="muted" style="font-size:0.7rem;margin:0.75rem 0">Check the browser console (F12) for details. Common causes: failed to load Supabase library from CDN (adblocker / network), bad config.js, or browser restrictions (file:// protocol).</p>
        <button onclick="location.reload()" class="btn mt-2">Reload</button>
      </div>`;
  }
});