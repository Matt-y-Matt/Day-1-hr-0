# Matt's Training App — context for Claude Code

> Current handover: read `PHASE-2-HANDOVER.md` first. Phase 2 in the Claude
> handover means the daily path (Phase 1 in the design spec). It is now implemented
> on the Phase 2 branch. Sections below describe the original app and include
> historical programme context; they are not verified deployment/account status.

Personal training app. Single user (Matt). Mobile-first PWA.
Tracks marathon training, strength, tendon rehab, commutes, and body metrics
for the Standard Chartered Singapore Marathon, **5 December 2026**.

---

## STACK

- Next.js 14 App Router, **plain JavaScript, no TypeScript**
- Supabase (Postgres + Auth + Storage), project ref `hyrbazjlrmzerujmyuus`, region ap-southeast-1
- URL: `https://hyrbazjlrmzerujmyuus.supabase.co`
- Vercel for hosting
- No Tailwind. Plain CSS in `app/globals.css`, class-based.

**Auth:** Supabase email/password. Publishable key comes from `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
falling back to a one-time setup screen that stores it in `localStorage` under `sb_key`.
See `lib/supabase.js`.

---

## ARCHITECTURE

Single route (`app/page.js`) with client-side state. Four tabs:
Dashboard · Week · Diary · Settings. Today and Progress are Dashboard subviews;
Pain, Daily block, Warm-up, general logs, Session and Export open as overlays.

**Core principle: the programme lives in database rows, not in code.**
Changing a workout means editing `workout_exercises`, never editing a component.
Do not hardcode exercises, sets, reps, or the run plan into JSX.

Components:
- `Today.js` — today's run + lift cards, pain-check nag, `DayCard` subcomponent
- `Commute.js` — one-tap commute logging with expandable detail panel
- `Session.js` — active lifting logger: steppers, cues, rest timer, RIR, finish screen
- `Timers.js` — `RestTimer` and `WarmupTimer` (guided, auto-advancing, wall-clock based)
- `Week.js` — scrollable week view, both directions
- `LogPanel.js` — three tabs: Pain / Run / Daily (weight, calories, protein, photos)
- `Progress.js` — marathon projection, ACWR, sparklines, weekly load and volume tables
- `Diary.js` — reverse-chronological feed of every session
- `ExportPanel.js` — builds a markdown digest, copies to clipboard

---

## DATABASE

**Tables:** `exercises`, `workout_days`, `workout_exercises`, `sessions`, `set_logs`,
`run_plan`, `runs`, `pain_logs`, `daily_log`, `photos`

**Views:** `v_last_performance`, `v_progression_suggestions`, `v_weekly_running`,
`v_commute_weekly`, `v_session_intensity`, `v_load_weekly`, `v_stagnation`

**Functions:** `marathon_projection()`, `acwr()`, `seed_all()` (calls `seed_exercises`,
`seed_program`, `seed_run_plan`, `seed_history`, `apply_tiers`, `reorder_by_tier`)

Every table has `user_id uuid default auth.uid()` with RLS enabled and a single
`user_id = auth.uid()` policy. Any new table must follow the same pattern.

Storage bucket `photos`, private, path convention `{user_id}/{date}-{slot}-{ts}.jpg`.

### Gotchas
- `create or replace view` fails if column **order or names** change. Use `drop view` then `create view`.
- `make_interval(mins => x)` needs an integer. Cast it.
- Seeding runs client-side on first login when `exercises` is empty — see `app/page.js`.

---

## THE PROGRAMME (do not silently change any of this)

### Tier system
Exercises carry `priority_tier` S/A/B/C, `tier_reason`, `go_ham_tips`, `requires_freshness`.
Session order is S → A → B → C, freshness-dependent first within each tier.
`reorder_by_tier()` enforces it. **S-tier:** Nordic curl, Barbell RDL, Spanish squat ISO,
Isometric dorsiflexion.

### Progression — double progression, suggestive only
All sets at top of rep range with RIR ≥ 2 → suggest +1 increment, reps reset to bottom.
**Never auto-apply.** Max one acceptance per session. `v_progression_suggestions`
already excludes rehab lifts when that site scored above 0 in the last 2 days.

### Three lifting days
Mon Upper Push · Thu Legs · Fri Upper Pull. Thursday is deliberate — two days after
threshold, three before the long run. Do not move it.

### Running
Long run grows +10%/week, 3 up + 1 cutback, capped ~180 min (3:15 for the two peak runs).
Easy runs stay 30–50 min. HR ceiling 135, target band 120–128. Cadence 172+.
Max HR 193, LTHR provisional 160 pending a 30-min TT.

---

## HARD CONSTRAINTS — these exist for injury reasons

- **Currently disabled** in `workout_exercises`: seated calf raise, standing calf raise,
  loaded tibialis raise. Left ankle extensor tendinopathy, flared 6 Sep 2026.
  Re-enable the tib raise FIRST, then the calf raises a week later, and only after
  two consecutive 0/10 cold morning readings.
- Two tendinopathies with flare history: right patellar, left ankle extensor.
- Plyometrics and stair sprints stay out until both tendons are silent 2+ weeks.
- The marathon projection function must report the **honest** number. Do not tune it
  to flatter. It currently reads ~5:15–5:45, not the 4:25 target, and that is correct.

---

## CURRENT STATE

**Done:** full schema, RLS, 30 seeded exercises with cues and tiers, 3 workout days,
25 run-plan entries through race day, 28 backfilled historical runs from 12 May,
pain history 6–11 Sep, all six tabs, both timers, commute logging with Garmin load,
ACWR, export. Builds clean.

**Not done yet:**
- Not deployed to Vercel
- `v_stagnation` exists but is not surfaced in the UI — flags lifts stuck 21+ days
- Photo compare view (upload works; no side-by-side browser)
- Garmin API sync (deliberately out of scope for v1 — manual entry takes 60 seconds)

---

## CONVENTIONS

- Plain JS, no TypeScript, no new dependencies without a good reason
- Mobile-first: large tap targets, steppers not keyboards, one-handed use
- Dark theme only. Accent `#e8462a`.
- Tier colours: S `#e8462a`, A `#e0a53a`, B `#5aa9e6`, C `#6b7280`
- Keep logging to the minimum fields — every extra field is a reason to skip logging
- Run `npx next build` before committing

---

## Design system

The visual spec lives in /design. Read `handoff-v2.md` before any UI
work — it has the token set, the complete state machine, the component
sheet, and a data contract naming real Supabase columns per screen.
`Training_Tracker_-_standalone.html` is the visual reference: 25 phone
frames, inline-styled, read exact values from it.

Design tokens and the full component CSS are ALREADY BUILT in
app/globals.css (build v2.1). Use the existing classes — do not
invent new ones or write inline hex values.

Phase names in this file historically ran one ahead of the design spec.
Use named scope: daily path → gym loop → rescheduling → logging depth → long tail.
