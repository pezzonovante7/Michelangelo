export const WEEKLY_SCHEDULE = [
  { day: 0, key: 'rest',       label: 'Rest',              code: '—', type: 'rest' },
  { day: 1, key: 'strength_a', label: 'Strength A — Push', code: 'S', type: 'strength' },
  { day: 2, key: 'boxing_a',   label: 'Boxing A',          code: 'B', type: 'boxing' },
  { day: 3, key: 'strength_b', label: 'Strength B — Pull', code: 'S', type: 'strength' },
  { day: 4, key: 'boxing_b',   label: 'Boxing B',          code: 'B', type: 'boxing' },
  { day: 5, key: 'strength_c', label: 'Strength C — Legs', code: 'S', type: 'strength' },
  { day: 6, key: 'boxing_c',   label: 'Boxing C',          code: 'B', type: 'boxing' },
];

export const STRENGTH_PROGRAM = {
  strength_a: {
    title: 'Strength A — Push',
    subtitle: 'Monday · Hypertrophy',
    pillars: ['strength'],
    exercises: [
      { name: 'Hammer Press',              sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Standing Lateral Machine',  sets: 4, repRange: '8-12', rest: 90 },
      { name: 'Weighted Dips',             sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Bench Press',               sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Cable Tricep Pushdown',     sets: 3, repRange: '8-12', rest: 60 },
    ],
  },
  strength_b: {
    title: 'Strength B — Pull + Balance',
    subtitle: 'Wednesday · Hypertrophy',
    pillars: ['strength', 'balance'],
    exercises: [
      { name: 'Weighted Pull-ups',     sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Chest-Supported Rows',  sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Lat Pull Downs',        sets: 4, repRange: '8-12', rest: 90 },
      { name: 'Preacher Curls',        sets: 3, repRange: '8-12', rest: 60 },
      { name: 'Australian Pull-ups',   sets: 3, repRange: '8-12', rest: 90 },
    ],
  },
  strength_c: {
    title: 'Strength C — Legs + Posterior',
    subtitle: 'Friday · Hypertrophy',
    pillars: ['strength'],
    exercises: [
      { name: 'KB Goblet Squat',        sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Seated Leg Curls',       sets: 4, repRange: '8-12', rest: 90 },
      { name: 'Hamstring Curls',        sets: 3, repRange: '8-12', rest: 60 },
      { name: 'Light Weight Deadlifts', sets: 4, repRange: '8-12', rest: 150 },
      { name: 'Standing Calf Raise',    sets: 4, repRange: '12-15', rest: 60 },
    ],
  },
};

export const BOXING_PROGRAM = {
  boxing_a: {
    title: 'Boxing A — Technique + Zone 2',
    subtitle: 'Tuesday · Skill & Endurance',
    pillars: ['zone2', 'mobility', 'balance'],
    phases: [
      { key: 'warmup',       name: 'Warm-up',           duration: 600,  hint: 'Light shadow boxing, mobility, McGill Big 3' },
      { key: 'technique',    name: 'Technique Drills',  duration: 1200, hint: 'Jab-cross, footwork, slips & rolls' },
      { key: 'zone2',        name: 'Zone 2 Conditioning', duration: 1200, hint: 'Steady shadow/bag — talk-test pace' },
      { key: 'balance',      name: 'Balance Finisher',  duration: 300,  hint: 'Single-leg stance with light punches' },
      { key: 'cooldown',     name: 'Cool-down',         duration: 300,  hint: 'Mobility + McGill Big 3' },
    ],
  },
  boxing_b: {
    title: 'Boxing B — Power + VO₂ Max',
    subtitle: 'Thursday · Intensity',
    pillars: ['vo2', 'strength', 'balance'],
    phases: [
      { key: 'warmup',       name: 'Warm-up',           duration: 600,  hint: 'Shadow boxing or jump rope + McGill Big 3' },
      { key: 'power',        name: 'Power Development', duration: 900,  hint: 'Explosive combos, hooks, uppercuts' },
      { key: 'hiit',         name: 'HIIT Intervals',    duration: 1200, hint: '4-6 rounds: 4 min hard / 3 min recovery' },
      { key: 'core_balance', name: 'Core & Balance',    duration: 600,  hint: 'Rotational core + single-leg holds' },
      { key: 'cooldown',     name: 'Cool-down',         duration: 300,  hint: 'Mobility + McGill Big 3' },
    ],
  },
  boxing_c: {
    title: 'Boxing C — Endurance + Mobility',
    subtitle: 'Saturday · Volume',
    pillars: ['zone2', 'mobility', 'balance'],
    phases: [
      { key: 'warmup',       name: 'Warm-up',              duration: 600,  hint: 'Light shadow + mobility + McGill Big 3' },
      { key: 'endurance',    name: 'Long Conditioning',    duration: 1800, hint: 'Continuous shadow/bag — Zone 2-3' },
      { key: 'skill',        name: 'Skill Integration',    duration: 900,  hint: 'Full combos with advanced footwork' },
      { key: 'mobility',     name: 'Mobility & Balance',   duration: 600,  hint: 'Extended stretching + single-leg drills' },
      { key: 'cooldown',     name: 'Cool-down',            duration: 300,  hint: 'Full mobility + McGill Big 3' },
    ],
  },
};

export const PILLARS = {
  strength:  { label: 'Strength' },
  zone2:     { label: 'Zone 2' },
  vo2:       { label: 'VO₂ Max' },
  mobility:  { label: 'Mobility' },
  balance:   { label: 'Balance' },
};

export const MCGILL_ITEMS = [
  'Curl-up',
  'Side plank (each side)',
  'Bird-dog (each side)',
];

export const MOBILITY_ITEMS = [
  'Cat-cow',
  'Thoracic rotations',
  'Hip openers',
  'Shoulder dislocations',
  'Ankle mobility',
];

export function getDayKey(date = new Date()) {
  return WEEKLY_SCHEDULE[date.getDay()].key;
}

export function getDayInfo(dayKey) {
  return WEEKLY_SCHEDULE.find(d => d.key === dayKey);
}

export function formatDate(d) {
  return d.toISOString().split('T')[0];
}

export function formatDisplayDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function getWeekDates(refDate = new Date()) {
  const day = refDate.getDay();
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}