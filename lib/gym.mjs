export function nextSet(items, logged) {
  for (let idx = 0; idx < items.length; idx++) {
    for (let n = 1; n <= items[idx].sets; n++) {
      if (!logged[items[idx].exercise_id]?.[n]) return { idx, setNo: n };
    }
  }
  return null;
}
export function loadLabel(weight, unit = 'total') {
  if (unit === 'bodyweight') return 'BW';
  if (unit === 'band') return 'band';
  if (weight == null || weight === '') return '—';
  if (unit === 'per_hand') return `${weight} kg /hand · ${Number(weight) * 2} kg total`;
  return `${weight} kg ${unit}`;
}
export async function recordId(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes.slice(0,16)].map(n => n.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function bodyComplete(row, photos) {
  return Number(row?.weight_am_kg) > 0 && Number(row?.weight_pm_kg) > 0 && photos.length > 0;
}
