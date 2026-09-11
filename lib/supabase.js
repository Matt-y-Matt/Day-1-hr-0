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
  S: { label: 'S', color: '#e8462a', note: 'Must do. Fresh, first.' },
  A: { label: 'A', color: '#e0a53a', note: 'High return.' },
  B: { label: 'B', color: '#5aa9e6', note: 'Worth doing.' },
  C: { label: 'C', color: '#6b7280', note: 'Cut first on a bad day.' },
};

export const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export const today = () => new Date().toLocaleDateString('en-CA');
