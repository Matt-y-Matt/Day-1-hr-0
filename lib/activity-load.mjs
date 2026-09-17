import { shiftDate } from './phase2-data.mjs';
export function activityKind(row) {
  if (row.run_type === 'cycle') return 'cycling';
  if (['walk', 'commute', 'rest'].includes(row.run_type)) return null;
  return 'running';
}
export function activityLoad(runs, sport, basis, end) {
  const start = shiftDate(end, -27), acuteStart = shiftDate(end, -6);
  const field = {time: 'duration_min', distance: 'distance_km', load: 'exercise_load'}[basis];
  const eligible = runs.filter(r => activityKind(r) === sport && r.date >= start && r.date <= end);
  const rows = eligible.filter(r => r[field] != null && Number.isFinite(Number(r[field])) && Number(r[field]) >= 0)
    .map(r => ({...r, value: Number(r[field]), in_acute: r.date >= acuteStart})).sort((a,b) => b.date.localeCompare(a.date));
  const acute = rows.filter(r => r.in_acute).reduce((sum,r) => sum+r.value,0);
  const total = rows.reduce((sum,r) => sum+r.value,0), chronic = total/4;
  return { rows, acute, total, chronic, ratio: chronic > 0 ? acute/chronic : null, missing: eligible.length-rows.length };
}
