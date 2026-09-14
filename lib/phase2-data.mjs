export const ANKLE_SITE = 'left_ankle_extensor';
export const PAIN_MOVEMENTS = ['dorsiflexion', 'eversion'];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return localDate(d);
}
export function latestPain(rows, date, site = ANKLE_SITE) {
  const result = {};
  [...rows].filter(r => r.date === date && r.site === site)
    .sort((a, b) => String(a.logged_at || a.created_at || '').localeCompare(String(b.logged_at || b.created_at || '')) || String(a.id).localeCompare(String(b.id)))
    .forEach(r => { result[r.movement] = r; });
  return result;
}
export function sessionProgress(items, logs) {
  const done = new Set(logs.map(r => `${r.exercise_id}:${r.set_number}`));
  let count = 0, total = 0, completeItems = 0, next = null;
  for (const item of items.filter(i => i.is_enabled !== false)) {
    let complete = true;
    for (let n = 1; n <= Number(item.sets || 0); n++) {
      total++;
      if (done.has(`${item.exercise_id}:${n}`)) count++;
      else { complete = false; if (!next) next = { item, setNumber: n }; }
    }
    if (complete && Number(item.sets) > 0) completeItems++;
  }
  return { count, total, completeItems, next };
}
