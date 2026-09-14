# Phase 4 — rescheduling

Build: `v2.4 · rescheduling`. Continues the project numbering; this corresponds to the design handoff's rescheduling phase (screens 21–24).

## Delivered

- Today: move-to-tomorrow and skip/change actions inside the session block.
- Week: selectable future session pills; seven-day reorder by drag or accessible arrow buttons. Multiple sessions move together when reordering a day. Previous weeks remain read-only.
- Move: destination date, explicit swap/stack choice for occupied days, exact preview.
- Change: skip with reason, run duration changes, restore skipped sessions, and replacement activity logging with explicit move/drop of the original plan.
- Guardrails: legs before long runs, consecutive hard days, long runs less than seven days apart, no full rest day. Warnings permit user choice. Long-run increases over 110% of the original plan require acknowledgement; recorded longest run is displayed as context.
- Atomic database RPC, revision conflict detection and idempotent retries. Changes include reasons and notes in training exports.
- Lift changes use occurrence overrides, preserving recurring templates and prior workouts. Dashboard, Today, Week and workout session identity use those occurrences.

## Data and deployment

Supabase project: `hyrbazjlrmzerujmyuus`. Applied migrations `phase4_occurrence_scheduling` and `phase4_preserve_new_plan_baselines`; canonical SQL is `db/phase4-scheduling.sql`. Adds run scheduling metadata, `lift_schedule` with owner RLS, session occurrence references, change request metadata, and `save_schedule_changes` (security invoker, fixed search path, authenticated only).

No real training sessions were moved, skipped or logged during verification. Database fixtures ran inside rolled-back transactions under authenticated account roles.

## Verification

- 32 automated tests passed, including cross-week projection, stacked sessions, guardrails, explicit swap selection and failed-save retry identity.
- Database checks passed: successful save, idempotency, stale revision rejection, long-run acknowledgement, lift override creation, whole-batch rollback, replacement activity logging and cross-account isolation.
- `npx next build` passed.
- Rendered move/swap screen inspected in browser using synthetic data. Production checked after release.

## Boundaries

- Shorten/lengthen edits run minutes. Lift set prescriptions are unchanged; lift editing remains a separate design phase.
- Duplicate-session creation is not included in screens 21–24; existing multi-session days are supported.
- Past or already-started/logged sessions cannot be rescheduled. The date boundary in the database is Singapore time.
- Scheduling warnings are programme rules, not an adaptive coaching or medical recommendation engine.
- The cap uses the original planned duration. The design reference's longest-recorded-run example conflicts with its numeric cap; historical maximum is therefore context rather than the baseline.
