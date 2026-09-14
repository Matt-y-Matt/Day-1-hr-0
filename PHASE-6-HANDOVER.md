# Phase 6 — programme and progress

Build `v2.6 · programme & progress`. Completes the design handoff's long-tail phase: Settings, Edit workout, Swap exercise, Progress and Photo compare.

## Delivered

- Settings: saved race name/date, HR ceiling/bands/max/LTHR, cadence, calorie targets by day type, protein and timer beeps. Input validation and failed-save retention. Race countdown, cadence, food targets and Progress use these values. Existing run-specific HR prescriptions remain explicit overrides; the Settings screen explains this. Units remain metric and weeks start Monday.
- Workout editor from Settings and Today: drag or arrow reordering, sets, rep ranges, hold duration, rest, target load with units, enable/disable with mandatory reason, and same-category swaps. Swap choices show the account's configured equipment, tier and rationale; no invented alternatives.
- Scope is explicit: programme changes affect future unstarted sessions; Today offers an occurrence-only override. Switching scope reloads that scope's saved prescription. Today-only changes to a started workout are rejected. Swapped target load is cleared for the new exercise.
- Atomic owner-scoped RPC, revision conflict detection and workout change export records. Keeps every slot and disallows duplicate exercise IDs (set identity depends on exercise ID).
- Started lifting sessions keep a saved workout snapshot. New set inserts are checked against that snapshot to prevent two devices logging different prescriptions into one canonical session. Existing logged sets are never rewritten.
- Progress replaces hardcoded markers with actual recorded long-run duration, running pace, separate cold-pain movements, threshold pace, best strength sets by day, body measurements, resting HR and weekly summaries. Walking/cycling/commutes are excluded from running pace and running volume. Missing values and zero are distinct.
- Private photo comparison: select two photos, signed URLs refreshed periodically, retry on unavailable images, AM/PM-specific weight and waist from the exact photo date. Missing measurements stay blank. No photos are made public.
- Existing marathon heuristic remains explicitly labelled (last three qualifying long runs, minus 45 seconds/km). Added positive distance/time and date filters; no unsupported race-outcome or injury-risk verdicts are displayed. ACWR is a descriptive recorded-load comparison, not a safety classification.

## Database

Applied migrations on `hyrbazjlrmzerujmyuus`:

- `phase6_workout_versions` — `db/phase6-workouts.sql`
- `phase6_set_snapshot_guard` — `db/phase6-set-snapshot-guard.sql`
- `phase6_recorded_progress` — `db/phase6-progress.sql`

Adds workout revision, session snapshot, occurrence overrides and workout audit records. All new tables have owner RLS. RPCs use security invoker, fixed search paths and authenticated-only execution.

Existing two sessions were given a snapshot of their then-current programme to freeze it before future edits. Older set logs remain authoritative where they differ from that programme (four historical sets were outside the then-current prescription); no historical set was changed. The insert guard does not prevent editing an existing historical set. No real targets, exercises or training records were changed during UI verification.

## Verification

- 53 tests passed, including settings failures, swap snapshot capture, resumed snapshot isolation, workout revision errors, private photo URL handling, exact-date photo metrics, running filters and recorded Progress rendering.
- Authenticated SQL tests passed and were rolled back: programme revision updates, stale-save rejection, snapshot preservation, today-only scope, started-workout rejection, set snapshot enforcement, cross-account isolation and zero-distance projection robustness.
- `npx next build` passed; phone-sized synthetic editor and Progress screens inspected. Production checked after release.
- Existing unrelated Supabase warnings remain: nine legacy functions with [mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) and leaked-password protection. The two Progress functions now have fixed search paths.

## Boundaries

Daily rehab-template editing is excluded from the workout editor; this phase covers the lifting programme. Historical photos are selected through the comparison controls; uploads remain in Today. Workout save retries after a lost successful response produce a revision conflict and require reload, rather than writing duplicate audit records.
