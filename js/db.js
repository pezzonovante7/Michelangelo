import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const OFFLINE_KEY = 'michelangelo_offline_queue';
const DRAFT_KEY = 'michelangelo_session_draft';
const CONFIG_KEY = 'michelangelo_config';

let supabase = null;

export async function loadConfig() {
  try {
    const mod = await import('./config.js');
    if (mod.SUPABASE_URL && !mod.SUPABASE_URL.includes('YOUR_PROJECT')) {
      return {
        url: mod.SUPABASE_URL,
        key: mod.SUPABASE_ANON_KEY,
        allowedGitHub: mod.ALLOWED_GITHUB_USERNAME ?? null,
      };
    }
  } catch { /* config.js not present */ }

  const stored = localStorage.getItem(CONFIG_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function saveConfig(url, key) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
}

export async function initClient() {
  const config = await loadConfig();
  if (!config?.url || !config?.key) return null;
  supabase = createClient(config.url, config.key, {
    auth: {
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
    },
  });
  return supabase;
}

export function getClient() {
  return supabase;
}

// ── Auth ──────────────────────────────────────────────

export async function signInWithGitHub() {
  return supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      scopes: 'read:user',
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('code')) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.get('code'));
    window.history.replaceState({}, '', window.location.pathname);
    if (error) throw error;
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function getGitHubUsername(user) {
  return user?.user_metadata?.user_name
    || user?.user_metadata?.preferred_username
    || user?.identities?.find(i => i.provider === 'github')?.identity_data?.user_name
    || null;
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

// ── Sessions ──────────────────────────────────────────

export async function getWeekSessions(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, session_date, day_key, status, session_rpe')
    .eq('user_id', userId)
    .gte('session_date', startDate)
    .lte('session_date', endDate);
  if (error) throw error;
  return data || [];
}

export async function getSessionByDate(userId, sessionDate, dayKey) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, strength_sets(*), boxing_phases(*)')
    .eq('user_id', userId)
    .eq('session_date', sessionDate)
    .eq('day_key', dayKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLastStrengthSession(userId, dayKey, beforeDate = null) {
  let query = supabase
    .from('sessions')
    .select('id, session_date, strength_sets(*)')
    .eq('user_id', userId)
    .eq('day_key', dayKey)
    .eq('status', 'completed')
    .order('session_date', { ascending: false })
    .limit(1);
  if (beforeDate) query = query.lt('session_date', beforeDate);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSession(session) {
  const { data, error } = await supabase
    .from('sessions')
    .upsert(session, { onConflict: 'user_id,session_date,day_key' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeSession(sessionId, updates) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ...updates, status: 'completed' })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Strength Sets ─────────────────────────────────────

export async function upsertStrengthSets(sets) {
  if (!sets.length) return;
  const { error } = await supabase
    .from('strength_sets')
    .upsert(sets, { onConflict: 'session_id,exercise_name,set_number' });
  if (error) throw error;
}

// ── Boxing Phases ─────────────────────────────────────

export async function upsertBoxingPhases(phases) {
  if (!phases.length) return;
  const { error } = await supabase
    .from('boxing_phases')
    .upsert(phases, { onConflict: 'session_id,phase_key' });
  if (error) throw error;
}

// ── Offline Queue ─────────────────────────────────────

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function enqueue(op) {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
  queue.push({ ...op, ts: Date.now() });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
}

export async function syncWithFallback(operation) {
  if (!navigator.onLine) {
    enqueue(operation);
    return { offline: true };
  }
  try {
    return await operation();
  } catch (err) {
    enqueue(operation);
    throw err;
  }
}

export async function flushOfflineQueue(processor) {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
  if (!queue.length) return 0;
  let flushed = 0;
  for (const op of queue) {
    try {
      await processor(op);
      flushed++;
    } catch {
      break;
    }
  }
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue.slice(flushed)));
  return flushed;
}