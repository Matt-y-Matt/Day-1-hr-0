'use client';
import { createClient } from '@supabase/supabase-js';

export const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hyrbazjlrmzerujmyuus.supabase.co';

export function getKey() {
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof window !== 'undefined') return window.localStorage.getItem('sb_key') || '';
  return '';
}

let _client = null;
export function supa() {
  const key = getKey();
  if (!key) return null;
  if (!_client) _client = createClient(SUPA_URL, key);
  return _client;
}

export const TIER = {
  S: { label: 'S', color: 'var(--accent)', text: 'var(--bg)',  note: 'Must do. Fresh, first.' },
  A: { label: 'A', color: 'var(--accent)', text: 'var(--bg)',  note: 'High return.' },
  B: { label: 'B', color: 'var(--inset-border)', text: 'var(--dim)', note: 'Worth doing.' },
  C: { label: 'C', color: 'var(--inset-border)', text: 'var(--dim)', note: 'Cut first on a bad day.' },
};

export const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export const today = () => new Date().toLocaleDateString('en-CA');

export const LOAD_UNIT = {
  per_hand:   { short: '/hand', help: 'Per dumbbell — one hand. Total load is double.' },
  total:      { short: 'total', help: 'Total on the bar or implement, both sides included.' },
  added:      { short: 'added', help: 'Added to bodyweight. 0 = bodyweight only.' },
  stack:      { short: 'stack', help: 'Machine or cable stack setting.' },
  bodyweight: { short: 'BW',    help: 'Bodyweight. Progress by range, tempo or assistance.' },
  band:       { short: 'band',  help: 'Band tension — log the band, not a number.' },
};

export function totalLoad(weight, unit) {
  if (unit === 'per_hand') return weight * 2;
  return null;
}

export const BUILD = 'v2.2 · the 60-second path';
