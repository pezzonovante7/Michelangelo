export function parseRepRange(repRange) {
  const parts = String(repRange).split('-').map(Number);
  return { min: parts[0], max: parts[1] ?? parts[0] };
}

export function groupSetsByExercise(sets) {
  const groups = {};
  (sets || []).forEach(s => {
    const name = s.exercise_name || s.exercise;
    if (!groups[name]) groups[name] = [];
    groups[name].push(s);
  });
  return groups;
}

export function getExerciseBest(sets) {
  let best = { weight: 0, reps: 0 };
  (sets || []).forEach(s => {
    const w = parseFloat(s.weight_kg ?? s.weight) || 0;
    const r = parseInt(s.reps) || 0;
    if (w > best.weight || (w === best.weight && r > best.reps)) {
      best = { weight: w, reps: r };
    }
  });
  return best;
}

export function getTodayTarget(lastSets, repRange) {
  if (!lastSets?.length) {
    return { kind: 'baseline', label: 'Set baseline', detail: 'Log all sets to track progression' };
  }

  const { min, max } = parseRepRange(repRange);
  const best = getExerciseBest(lastSets);
  const reps = lastSets.map(s => parseInt(s.reps) || 0);
  const allAtTop = reps.every(r => r >= max);
  const weakest = Math.min(...reps);

  if (allAtTop) {
    const target = roundWeight(best.weight + 2.5);
    return {
      kind: 'weight',
      label: `+2.5 kg`,
      detail: `Aim ${target} kg × ${min}–${max} reps`,
      targetWeight: target,
    };
  }

  if (weakest < max) {
    return {
      kind: 'reps',
      label: `+1 rep`,
      detail: `Stay ${best.weight} kg — hit ${weakest + 1}+ on every set`,
      targetWeight: best.weight,
      targetReps: weakest + 1,
    };
  }

  return {
    kind: 'match',
    label: 'Match & push',
    detail: `Beat ${best.weight} kg × ${best.reps}`,
    targetWeight: best.weight,
    targetReps: best.reps + 1,
  };
}

export function compareSetToLast(current, last) {
  const cw = parseFloat(current.weight) || 0;
  const cr = parseInt(current.reps) || 0;
  const lw = parseFloat(last?.weight_kg ?? last?.weight) || 0;
  const lr = parseInt(last?.reps) || 0;
  if (!cw && !cr) return null;
  if (!last) return cw || cr ? 'baseline' : null;
  if (cw > lw) return 'pr';
  if (cw === lw && cr > lr) return 'pr';
  if (cw === lw && cr === lr) return 'matched';
  return 'below';
}

export function getSetProgressStatus(set, lastMap) {
  if (!set.completed) return null;
  const last = lastMap[`${set.exercise}_${set.setNumber}`];
  return compareSetToLast(set, last);
}

export function getExercisePRs(currentSets, lastSession) {
  const prs = [];
  const lastGroups = groupSetsByExercise(lastSession?.strength_sets);
  const names = [...new Set(currentSets.map(s => s.exercise))];

  names.forEach(name => {
    const done = currentSets.filter(s => s.exercise === name && s.completed && s.weight);
    if (!done.length) return;

    const currBest = getExerciseBest(done.map(s => ({ weight: s.weight, reps: s.reps })));
    const lastBest = getExerciseBest(lastGroups[name]);

    if (!lastBest.weight) {
      prs.push({ exercise: name, type: 'baseline', msg: `${currBest.weight} kg × ${currBest.reps} — first log` });
    } else if (currBest.weight > lastBest.weight) {
      prs.push({ exercise: name, type: 'pr', msg: `${currBest.weight} kg × ${currBest.reps} ↑ from ${lastBest.weight}×${lastBest.reps}` });
    } else if (currBest.weight === lastBest.weight && currBest.reps > lastBest.reps) {
      prs.push({ exercise: name, type: 'pr', msg: `${currBest.weight} kg × ${currBest.reps} ↑ from ×${lastBest.reps}` });
    }
  });

  return prs;
}

export function getNextSessionAdvice(currentSets, exercises, lastSession) {
  const lastGroups = groupSetsByExercise(lastSession?.strength_sets);
  return exercises.map(ex => {
    const done = currentSets.filter(s => s.exercise === ex.name && s.completed);
    const { max } = parseRepRange(ex.repRange);
    const hitTop = done.length && done.every(s => (parseInt(s.reps) || 0) >= max);
    const best = getExerciseBest(done.map(s => ({ weight: s.weight, reps: s.reps })));

    if (!done.length) return null;
    if (hitTop) return { exercise: ex.name, advice: `Next time: ${roundWeight((parseFloat(best.weight) || 0) + 2.5)} kg` };
    const minReps = Math.min(...done.map(s => parseInt(s.reps) || 0));
    return { exercise: ex.name, advice: `Next time: ${best.weight} kg × ${minReps + 1}+ reps` };
  }).filter(Boolean);
}

function roundWeight(w) {
  return Math.round(w * 2) / 2;
}

export function formatLastSession(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}