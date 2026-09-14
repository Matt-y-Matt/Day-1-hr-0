# Phase 3 — v2.3 · gym loop

Scope follows the user's Phase 3 list and design/handoff-v2.md section 4a. The
design document calls this Phase 2. Rescheduling, workout editing/swaps and the
deeper Progress/Diary work remain later phases.

## Delivered

- Today: date/subtabs, run/lift toggle, pain, daily progress, inline Body, one Food
  card, Commute, then the session. No content below the session block.
- Body: AM/PM weight and waist inputs, inline save, dashed empty fields, AM/PM
  image file pickers and private signed thumbnails. Both saved weights plus at
  least one saved photo collapse it to a 58px summary; tap reopens. Failed writes
  retain input; photo retries reuse the upload and row identity.
- Food: real totals, saved targets and favourites. Search and minimal custom
  entry write serving-adjusted meal rows. Deeper food catalogue and meal history
  editing and saving custom foods remain later work.
- Gym: completed chips load saved values. Update stays on the set; Delete returns
  it to pending. Load/reps/hold inputs accept typing; loads name their unit and
  per-hand values show doubled totals. RIR target comes from exercises.rir_target.
  Progression suggestions are displayed, never automatically applied.
- First save starts a session. New set IDs remain stable across retries. Existing
  sets retain their row IDs on edit. Failed reads/writes block advancement. Legacy
  duplicate set groups remain unless that set is explicitly deleted.
- Rest: Phase 2 deadline engine, countdown ring, Start set N now primary, +30s
  secondary. Uses workout_exercises.rest_seconds. Each rest persists independently;
  expiry never logs a set or skips the ready screen.
- Week: seven read-only rows, multiple session pills, status glyphs, planned
  session count, logged run minutes and recorded weekly load.
- Login: bundled publishable application configuration and optional env overrides;
  no browser key setup, only email/password sign-in.

## Live programme repair — 14 September 2026

Each existing account now owns 36 exercises, four workout days and 38 prescription
rows. Their 24-row run plans were already equivalent and unchanged. Copied missing
programme rows, mapped prescriptions to the owner's exercise/day, and repointed
existing set-history exercise references to that account's matching exercise.
Did not merge accounts, duplicate history/photos, change credentials, or change
prescription values. Existing RLS keeps accounts isolated.

Before/after historical counts: 2 sessions, 26 sets, 59 runs, 20 pain rows.
Both authenticated role checks read four days / 38 joined prescriptions and zero
foreign set/run rows. No cross-owner prescription references remain. Private
snapshots and the scoped transaction are outside the repository in the workspace's
artifacts/database-review directory.

## Verification and limits

`npm test`: 28 tests including real React components with synthetic transport.
Covers failed saves, edit without advance, deletion, repeated taps, body/photo
retries, cockpit order and two-session Friday. `npx next build` checks production
compilation and static generation.

Mobile layout checks use synthetic rendered component snapshots, not live account
writes. No real workout or photo was created as test data. Fresh-browser production
login is checked separately at release. Real phone camera selection and audible
cues while locked require device testing; phones may silence background audio.

Phase 2 database access hardening remains applied. Existing function search_path
and password-protection advisor warnings remain separate from this release.
