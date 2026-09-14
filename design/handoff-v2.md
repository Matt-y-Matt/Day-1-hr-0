Training Tracker v2 · Next.js 14 · plain JS · plain CSS · 25 frames · 14 Sep 2026

# Training Tracker — UI handoff spec v2

Companion to `Training Tracker.dc.html` (25 phone frames + component sheet). Stack: **Next.js 14 App Router, plain JavaScript, plain CSS, PWA on Vercel.** v1 tokens, type scale, geometry and components carry over verbatim — this document adds to them and corrects them where marked **CHANGED v1**.

---

## 0. The 60-second test

The design is built around one path. Everything else yields to it.

| Sec | Action | Taps |
|---|---|---|
| 0–3 | Open app → Dashboard | 0 |
| 3–12 | Amber row `Pain not scored cold · 4 taps` → Pain log | 1 |
| 12–25 | Dorsiflexion `0`, Eversion `0`, `Save both scores` | 3 |
| 25–32 | Back on Dashboard: `Long run 105 min · HR ≤135` visible | 0 |
| 32–38 | `Start run` → Warm-up pre-start (variant + duration) | 1 |
| 38–45 | `Start warm-up` → step 1 counting down | 1 |
| 45+ | Phone in pocket. Beeps do the rest. | 0 |


**Seven taps, no reading twice.** Two consequences for the port: the pain row must be the first amber thing on Dashboard, and `Start run` must not open an intermediate chooser — the variant is inferred from `run_plan.warmup_type` and shown, not asked.

---

## 1. Architecture

One route: `app/page.js`. All view state client-side.

```
// 'use client'
const [tab, setTab]         = useState('dashboard'); // dashboard | week | diary | settings
const [sub, setSub]         = useState('overview');  // dashboard only: overview | today | progress
const [overlay, setOverlay] = useState(null);        // see §2
const [returnTo, setReturnTo] = useState(null);      // {tab, sub} snapshot taken on open
```

Overlays are `position: fixed; inset: 0` divs, each with its own scroll column and its own copy of the bottom nav (the nav stays on the tab you came from — it is chrome, not state).

```
function openOverlay(name, payload) {
  setReturnTo({ tab, sub });
  setOverlay({ name, ...payload });
  history.pushState({ overlay: name }, '');
}
function closeOverlay() {           // ✕ / ‹ / popstate / Save
  setOverlay(null);
  if (returnTo) { setTab(returnTo.tab); setSub(returnTo.sub); }
}
useEffect(() => {
  const onPop = () => setOverlay(null);
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}, []);
```

Timers (daily block, warm-up) must survive a backgrounded PWA: store `startedAt` epoch ms and derive remaining time from `Date.now()` on every tick and on `visibilitychange`. Never decrement a counter — iOS throttles `setInterval` in background and the count drifts.

---

## 2. Complete state machine

### Tabs — four, the ceiling

| `tab` | Screen | Notes |
|---|---|---|
| `dashboard` | 00 / 01 / 04 via `sub` | default on launch |
| `week` | 05 Week | **CHANGED v1** — day rows now carry `⋮` |
| `diary` | 06 Diary | **CHANGED v1** — pain section replaced |
| `settings` | 16 Settings | **NEW**, replaces the Export tab |


Tapping `dashboard` while already there → `setSub('overview')`.

### Sub-views (dashboard only)

| `sub` | Screen | Opened by | Notes |
|---|---|---|---|
| `overview` | 00 Dashboard | launch, nav re-tap |  |
| `today` | 01 Today | `Open →` on Today card, swipe left | swipe pager |
| `progress` | 04 Progress | `See all →`, swipe right | holds Export button |


### Overlays

| `overlay.name` | Screen | Opened by | Closed by | `returnTo` |
|---|---|---|---|---|
| `activeSet` | 02 / 20 | `Start lift` · `Resume Legs` · `Start run`† | `Pause` | origin |
| `rest` | 03 Rest timer | `✓ Log set N` | `Start set N+1 now` → `activeSet` | — |
| `dailyBlock` | 10 Daily block | daily row on Dashboard or Today | `‹` | origin |
| `dailyTimer` | 11 Daily timer | `Continue · item N of 9` | `Pause` → `dailyBlock` | `dailyBlock` |
| `painLog` | 12 Pain log | Today/Dashboard amber row · Diary pain card · `Log` | `✕` · `Save both scores` | origin |
| `warmupPre` | 13 Warm-up | `Start warm-up` · `Start run` | `✕` | origin |
| `warmupStep` | 14 Warm-up step | `Start warm-up` on 13 | `Exit` → origin | origin |
| `warmupDone` | 15 Warm-up done | last step completes | `Done · back to Today` | `{dashboard, today}` |
| `food` | 08 Food log | Today food row · food card search | `‹` | origin |
| `customFood` | 17 Custom food | `+ Custom` chip · `+ Custom food` | `✕` · `Add to <meal>` → `food` | `food` |
| `commute` | 09 Commute log | `→ To work` · `← Home` | `✕` · `Save & back to Today` | `{dashboard, today}` |
| `editWorkout` | 18 Edit workout | `Edit workout` on Today lift block | `✕` · `Save workout` | origin |
| `swapExercise` | 19 Swap exercise | `Swap exercise` · exercise row long-press | `✕` · `Swap to X` | origin |
| `moveSession` | 21 Move session | Week row `⋮ → Move to…` · Today `Move to tomorrow` | `✕` · `Confirm move` | origin |
| `changeSession` | 22 Change session | Week row `⋮ → Skip` · Today `Skip · shorten` | `✕` · `Save` | origin |
| `reorderWeek` | 23 Reorder week | `Reorder week` on Week | `‹` · `Save new order` | `week` |
| `lengthenGuard` | 24 Lengthen guard | stepper on 22 pushed above the +10% cap | `Keep 105 min` · `I understand` | `changeSession` |
| `export` | 07 Export | `Export` button on Progress · Settings | `✕` | origin |


† **RESOLVED (B8):** `Start run` opens `warmupPre`. There is no run-in-progress state. Garmin owns the run.

`activeSet` has two modes on one screen: `mode: 'log'` (02) and `mode: 'edit', setNumber: N` (20). Edit mode is entered by tapping a completed set chip and **never advances** — Save writes in place and returns to `mode: 'log'` at the next unlogged set.

---

## 3. Component sheet delta

Only new or changed. Everything else in v1 §2 stands.

### `.ring` — countdown ring **NEW**

Two `<circle>`s in one rotated SVG. No animation library; update `stroke-dashoffset` from the derived remaining time.

```
.ring { position: relative; flex: none; }               /* 238px daily, 228px warm-up, 210px done */
.ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.ring__track { stroke: var(--inset); stroke-width: 10; fill: none; }
.ring__fill  { stroke: var(--accent); stroke-width: 10; fill: none; stroke-linecap: round; }
.ring__val   { font: 700 52px/1 var(--mono); color: var(--ink); letter-spacing: -.02em; }
.ring__unit  { font: 500 11px/1 var(--mono); letter-spacing: .16em; color: var(--dim); }
```

`stroke-dasharray = 2πr`, `stroke-dashoffset = 2πr × (1 − remaining/total)`. Fill is `--accent` while holding, `--good` on the warm-up step screen and at completion.

### `.pips` — hold and step progress **NEW**

```
.pips      { display: flex; gap: 6px; }
.pips > i  { width: 30px; height: 6px; border-radius: 3px; background: var(--inset); }
.pips > i.is-done    { background: var(--accent); }
.pips > i.is-current { background: rgba(232,70,42,.5); }
.pips--steps { gap: 3px; }
.pips--steps > i { flex: 1; width: auto; height: 5px; }   /* 14 across the screen width */
```

### `.painscale` — 0.5-step scale **CHANGED v1** (replaces the ten 1–10 cells)

Six fast values inline; `More ▸` expands to the full 0–10 in 0.5 steps.

```
.painscale       { display: flex; gap: 6px; }
.painscale > b   { flex: none; min-width: 52px; height: 48px; display: flex;
                   align-items: center; justify-content: center; padding: 0 10px;
                   background: var(--inset); border: 1px solid var(--inset-border);
                   border-radius: 10px; font: 600 15px/1 var(--mono); color: var(--ink); }
.painscale > b.is-on { background: var(--warn); border-color: var(--warn); color: var(--bg); }
```

Fast values: `0 · 0.5 · 1 · 1.5 · 2 · 3`. Selected fill is `--warn` unless the value is `0`, which fills `--good`.

### `.sparkline--multi` — two movements **NEW**

Same hand-written SVG as v1, two `<polyline>`s in one `326×84` box. Second line is `stroke-dasharray="5 4"` so the pair reads without colour. Baseline `<line>` at y=74 in `--inset-border`. A legend is mandatory — the divergence is the whole point and an unlabelled pair is unreadable.

### `.editstrip` — editing a logged set **NEW**

```
.editstrip { display: flex; align-items: center; gap: 10px; padding: 12px 13px;
             background: rgba(224,165,58,.12); border: 1px solid rgba(224,165,58,.42);
             border-left: 3px solid var(--warn); border-radius: 11px;
             font: 500 13px/1.35 var(--sans); color: var(--warn); }
```

Copy is fixed: _"Editing a logged set. Save overwrites it; nothing jumps forward."_

Set chips gain a third state:

```
.setchip.is-done    { background: rgba(62,207,142,.14); border: 1px solid rgba(62,207,142,.5); color: var(--good); }
.setchip.is-editing { background: rgba(224,165,58,.16); border: 2px solid var(--warn); color: var(--warn); font-weight: 700; }
.setchip.is-pending { background: var(--card); border: 1px solid var(--inset-border); color: var(--dim); }
```

### `.btn--resume` — resume state **NEW**

```
.btn--resume      { height: 60px; display: flex; align-items: center; justify-content: center;
                    gap: 11px; background: var(--accent); border-radius: 12px; }
.btn--resume b    { font: 700 17px/1 var(--sans); color: var(--bg); }
.btn--resume span { padding: 4px 8px; background: rgba(10,10,11,.22); border-radius: 6px;
                    font: 600 11.5px/1 var(--mono); color: var(--bg); white-space: nowrap; }
```

Caption beneath in `--dim` mono 11px: `STARTED 18:02 · PICKS UP AT RDL SET 3`. Shown when `sessions.started_at IS NOT NULL AND completed_at IS NULL` for today.

### `.grip` — drag handle **NEW**

```
.grip     { flex: none; width: 20px; display: flex; flex-direction: column;
            gap: 3px; align-items: center; touch-action: none; }
.grip > i { width: 14px; height: 2px; border-radius: 1px; background: #3a3a40; }
.row.is-dragging { background: var(--raised); border-color: var(--accent);
                   box-shadow: 0 8px 22px rgba(0,0,0,.5); }
```

Hand-rolled drag: `pointerdown` on `.grip` only (never the whole row — it would eat vertical scroll), `pointermove` with `transform: translateY()`, `pointerup` commits the new `order_index`. `touch-action: none` on the handle, not the row.

### `.exrow.is-disabled` — disabled exercise **NEW**

`opacity: .45`, name and prescription `text-decoration: line-through`, tier pill greyed to `--inset-border` with `--dim` text. The `disabled_reason` renders **outside** the faded row in a full-opacity amber note — a struck-through reason is unreadable and the reason is the useful part.

### `.load` — load unit **CHANGED v1**

A weight is never bare. `value` in mono + `unit` in `--dim`. `load_unit` renders exactly as stored: `total` · `stack` · `/hand` · `added` · `BW` · `band`. When `/hand`, a second line in `--dim` mono 10.5px shows the doubled total: `28 kg total across both hands`.

### `.callout` variants — guardrails **CHANGED v1**

Three meanings now carry fixed colours:

- **amber** — a cost you are choosing to pay (_"…it will cost you Sunday."_)
- **red** — a standing rule (_"One 45s Spanish squat hold before you start. Every run."_)
- **green** — all clear (_"Both movements read 0. Cleared for the long run."_)
- **blue** — neutral explanation of what a control will do

**Guardrails warn, they never block.** Every guardrail screen keeps its primary button enabled. The only friction in the app is `lengthenGuard` (24), and even that is a confirm, not a lock.

---

## 4. Screens — data contract

Table and column names exactly as given. `→` writes, `←` reads.

### 00 Dashboard

← `run_plan(date, run_type, duration_min, hr_ceiling, hr_target_low, hr_target_high, is_key_session)` · `workout_days(name, session_type, est_minutes)` · `sessions(date, started_at, completed_at)` for the resume state · `pain_logs(date, site, movement, score)` for the amber row · `v_last_performance` for Key lifts · `set_logs` via `v_progression_suggestions` for the `+2.5 this wk` deltas · daily-block completion (see flag below). No writes.

### 01 Today

← as Dashboard, plus `workout_exercises(sets, rep_min, rep_max, hold_seconds, target_weight_kg, is_enabled, disabled_reason, order_index)` joined to `exercises(name, priority_tier, load_unit, rir_target, tempo)` · `daily_log(weight_am_kg, weight_pm_kg, waist_cm)` · `v_daily_nutrition` · `v_commute_weekly` · `photos(date, slot)` for the "2 photos" count. → `daily_log(weight_am_kg, weight_pm_kg, waist_cm)` from the expanded body card · `photos(date, slot, storage_path)`. All four writable in place — see §4a.

### 02 / 20 Active set

← `workout_exercises` + `exercises(cue_setup, cue_execution, cue_mistake, feel_target, increment_kg, load_unit, rir_target, priority_tier)` · `v_last_performance` for _"Last time, set 2"_ · `v_progression_suggestions` for the `↑` callout · `set_logs(set_number, weight_kg, reps, rir, logged_at)` for the chips. → `set_logs(session_id, exercise_id, set_number, weight_kg, reps, hold_seconds, rir, logged_at)` — insert in log mode, **update in place** in edit mode, delete on `Delete set N` · `sessions(started_at)` on first set.

### 03 Rest timer

← `workout_exercises(sets)` · next `exercises(name)` · rest seconds (see flag below). No writes.

### 04 Progress

← `marathon_projection()` · `acwr()` · `v_weekly_running` · `v_load_weekly` · `v_stagnation` · `runs(duration_min, hr_avg, cadence_avg, min_under_135)` · `pain_logs` for the tendon trend · `v_last_performance` per legs exercise · `daily_log(weight_am_kg, waist_cm)` and `photos(date, slot, storage_path)` for Photo compare. No writes. Holds the `Export` button.

### 05 Week

← `run_plan` + `workout_days` + `sessions` for the seven rows · `v_weekly_running` · `v_load_weekly` for the LOAD stat · `run_plan(block)` for `BUILD 3 · WK 7 OF 16`. → nothing directly; `⋮` opens 21 / 22.

### 06 Diary **CHANGED v1**

← `pain_logs(date, site, movement, score)` — the two tracked movements with yesterday's values · `daily_log(sleep_hours, weight_am_kg, note)` · `sessions(feel_1_5, session_note)`. → `daily_log(resting_hr, sleep_hours, note)` · `sessions(feel_1_5, session_note)`. Pain writes happen in 12, not here.

### 07 Export **CHANGED v1**

← everything in the range: `runs` · `sessions` · `set_logs` · `pain_logs` · `daily_log` · `meal_logs` · skip reasons. → nothing. `navigator.clipboard.writeText(markdown)`.

### 08 Food log

← `foods(name, serving_desc, kcal, protein_g, is_local, is_favourite)` · `meal_logs(date, meal, food_id, custom_name, servings, kcal, protein_g)` · `v_daily_nutrition` · target from settings. → `meal_logs` insert / update servings / delete.

### 09 Commute log

← last matching `runs(commute_direction, duration_min, distance_km)` for _"tap to reuse"_ · `v_commute_weekly`. → `runs(date, run_type='commute', commute_direction, duration_min, distance_km, rpe, carried_load_kg)`.

### 10 / 11 Daily block **NEW**

← `workout_days(is_daily=true)` → `workout_exercises(order_index, sets, hold_seconds)` → `exercises(name, cue_execution, priority_tier, is_rehab)`. → `sessions(workout_day_id, date, started_at, completed_at)` for the day's block · `set_logs(exercise_id, set_number, hold_seconds, logged_at)` one row per completed hold.

### 12 Pain log **NEW**

← `pain_logs(date, site, movement, score, note)` — today pre-filled from yesterday's sites, plus 14 days for the sparkline. → `pain_logs(date, site, movement, score, note)`, one row per movement. Two rows on the fast path.

### 13 / 14 / 15 Warm-up **NEW**

← `run_plan(date, warmup_type, duration_min, hr_ceiling, hr_target_low, hr_target_high, is_key_session)` — `warmup_type` picks FULL or SHORT. → optional `sessions(started_at)` marking the warm-up done; nothing else. The run itself comes from Garmin.

### 16 Settings **NEW**

← auth user email · `run_plan(hr_ceiling, hr_target_low, hr_target_high)` as current defaults · race date. → target values. **See flags — most of these have no column.**

### 17 Custom food **NEW**

→ `foods(name, category, serving_desc, kcal, protein_g, carbs_g, fat_g, is_local, is_favourite)` when `save to my foods` is on; otherwise straight to `meal_logs(custom_name, kcal, protein_g, servings)`.

### 18 Edit workout **NEW**

← `workout_exercises` + `exercises(name, priority_tier)`. → `workout_exercises(order_index, sets, rep_min, rep_max, hold_seconds, is_enabled, disabled_reason)`.

### 19 Swap exercise **NEW**

← `exercises(name, category, priority_tier, evidence_tier, tier_reason, load_unit, increment_kg)` filtered by `category` = the current exercise's category. → `workout_exercises(exercise_id)` — permanent; or a session-scoped override for `Just for today`. **See flags.**

### 21 Move session **NEW**

← `run_plan(date, run_type, duration_min, is_key_session)` + `workout_days` for every day in the week · `v_load_weekly` for the guardrail checks. → `run_plan(date)` for the moved session, and the displaced one on a Swap.

### 22 Change session **NEW**

→ `run_plan(duration_min)` on Shorten · `runs(...)` on _Did something else_ · skip reason. **See flags.**

### 23 Reorder week **NEW**

← whole week + `v_weekly_running` history for adherence. → `run_plan(date)` / `workout_days(weekday)` per moved row.

### 24 Lengthen guard **NEW**

← `runs(duration_min)` max to date for the cap · `run_plan(duration_min)` planned. → `run_plan(duration_min)` only on explicit confirm.

---

## 4a. Today is the cockpit **CHANGED v2**

Everything logged daily is entered on Today without leaving it. Nothing here is a launcher to somewhere else except the two things that genuinely need their own screen (pain scoring, food search).

Morning stack, top to bottom:

1. **Date + subtabs** — `Friday 11 September` / `85 days to SCSM`, Today ⇄ Progress
2. **Run / Lift toggle**
3. **Pain row** (amber) — `Pain not scored cold` / `Dorsiflexion + eversion · 4 taps` → `painLog`
4. **Daily · tendon + hip** — `4 of 9 · 11 min left` → `dailyBlock`
5. **Body · daily** — expanded, writable in place
6. **Food · today** — the one and only food entry point
7. **Commute** — `→ To work` / `← Home` → `commute`
8. **Session block** — run or lift, Start/Resume + edit/move secondaries

The stack ends at the session. Nothing sits below it.

### Body card — expanded inline, not a drill-down

v1 showed a 58px collapsed summary row that had to be tapped to reach the weights and photos, which made Today a launcher rather than a place to log. The card is now expanded by default with every field writable in place:

| Field | State | Treatment |
|---|---|---|
| WEIGHT AM | `71.7 kg` filled | solid `--inset-border` |
| WEIGHT PM | `Tap kg` empty | **1px dashed `#3a3a40`** |
| WAIST | `83 cm` + `−7 cm since May` | 104px `--good` sparkline |
| AM photo | taken | 32×40 thumbnail + `TAKEN 6:41` in `--good` |
| PM photo | empty | dashed border, camera icon, `TAP TO TAKE` |


**Dashed border = awaiting input.** An empty field is never rendered as if it held a value. The header carries an amber dot + `PM WEIGHT + 1 PHOTO LEFT` so what is outstanding reads without scanning the fields.

```
.field           { background: var(--inset); border: 1px solid var(--inset-border); border-radius: 11px; padding: 9px 11px; }
.field.is-empty  { border: 1px dashed #3a3a40; }
.field.is-empty .field__val { color: var(--dim); }
```

Weights are `<input inputMode="decimal">`. Photos are `<input type="file" accept="image/*" capture="environment">` styled as the card row — no custom camera UI, no permission flow beyond the file picker.

Collapse rule unchanged: once both weights and at least one photo exist for the day, render the 58px collapsed row (`71.7 / 72.4 kg · waist 83 · 2 photos`, green dot, `▸`) which reopens on tap. Both states stay in the component sheet — collapsed is the end state, not a dead design.

Writes `daily_log(date, weight_am_kg, weight_pm_kg, waist_cm)` and `photos(date, slot, storage_path)`.

### Food — one entry point, not two

v1 shipped **two** food affordances on Today: a 58px `Search food · 1,840 / 2,300` pill in the morning stack, and the full food card below the session with its own search field — two controls for one job, ~600px apart. **The pill is deleted.**

What remains is the single food card, moved up into the morning stack directly under the body card:

- `FOOD · TODAY` + `1,840 / 2,300`
- 8px accent kcal bar · `460 kcal left` / `128 / 155g P` · 5px green protein bar
- 52px `Search food…` field + `1 TAP` tag → `food` overlay
- Quick chips `ON ISO` · `Chicken rice` · `Kopi C kosong` · `+ Custom`

One-tap-to-food-search still holds, and now unambiguously — there is exactly one thing to tap. Reads `v_daily_nutrition` + `foods(is_favourite)`; the overlay does the `meal_logs` writes.

---

## 5. Flagged — data the schema does not cover

Not invented as columns. Each needs a decision before the port.

1. **Skip / change reason** (B9c) — `Sore · Tired · Sick · No time · Travel · Injury`. No column. `runs.notes` and `sessions.session_note` are freeform and can't be aggregated, and the brief says the _pattern_ of skips is coaching signal. **Recommend** `sessions.skip_reason TEXT` + `run_plan.skip_reason TEXT`, or a small `plan_changes(id, date, session_ref, action, reason, note, created_at)` table which also gives Move/Swap/Stack an audit trail. I'd take the table — it answers "what did I change and why" in one query.
2. **Daily-block completion** — `is_daily` marks the routine, but per-day per-item completion has no home. `sessions` + `set_logs` works (one session row per day, one set_log per hold) but "4 of 9" then requires counting distinct `exercise_id`s. Acceptable. Flagging because it's a read on every Dashboard paint — **recommend** a `v_daily_block_today` view.
3. **Rest-timer seconds** — 02/03 show rest between sets and the Session timing steppers set it. No column on `workout_exercises` or `exercises`. **Recommend** `workout_exercises.rest_seconds`.
4. **Settings targets** — cadence 172, calorie/protein targets by day type, units, week start, beep on/off, max HR 193, threshold 155–162. Only HR ceiling and band exist, and only per `run_plan` row. **Recommend** a `user_settings` single-row table; these are not per-session facts.
5. **Warm-up step content** — the 14 and 6 step names and durations. Not in `exercises` (they aren't loadable lifts). **Recommend** a static config in the codebase, not a table — they change with the programme, not per user. `run_plan.warmup_type` already selects between them.
6. **Daily-block cue text** — `exercises.cue_execution` holds it. No new column needed, but the daily-block items must exist as `exercises` rows with `is_rehab = true`.
7. **`Just for today` swap** (19) — a session-scoped exercise substitution. No column. **Recommend** `set_logs.exercise_id` simply differing from the plan, with no plan write at all — the history already tells the truth.
8. **Body fat 24.4%** (Evolt) — no column on `daily_log`. Shown nowhere in the mock for that reason. **Recommend** `daily_log.body_fat_pct` if it's going to be tracked, or drop it.
9. **Photo compare weight/waist** — reads `daily_log` by the photo's date. If no `daily_log` row exists for that date the stats are blank; the mock always shows them. Needs a fallback (nearest ±3 days, or `—`).

---

## 6. Build order

Phased by value-to-effort. Each phase ships standalone.

**Phase 1 — the 60-second path.** Nothing else matters if this isn't right.

1. 12 Pain log — highest value in the app; two rows, one table, no timer
2. 00 Dashboard — read-only, but it's the front door; needs the pain row and the resume state
3. 13/14/15 Warm-up — the timer engine gets built once here and reused by 11
4. 10/11 Daily block — reuses the Phase 1 timer; highest-frequency action

**Phase 2 — the gym loop.**

1. 01 Today — big screen, but mostly composition of parts already built. Build the body card four writable fields here rather than as a separate screen; Today is the only place the daily numbers get entered (§4a)
2. 02/20 Active set + set editing — editing is a mode, not a screen; cheap once 02 exists
3. 03 Rest timer — trivial after the timer engine
4. 05 Week — read-only week view

**Phase 3 — rescheduling.** Highest-value editing, but it needs the guardrail engine.

1. 21 Move session + 22 Change session — share the guardrail checks
2. 24 Lengthen guard — one confirm screen, reuses 22's stepper
3. 23 Reorder week — the drag interaction is the most expensive thing in the app; do it last in this phase

**Phase 4 — logging depth.**

1. 08 Food log + 17 Custom food
2. 09 Commute log
3. 06 Diary
4. 07 Export — trivial once the tables have data, and it's how you review everything else

**Phase 5 — the long tail.**

1. 16 Settings — needed for real targets, but hardcode them until `user_settings` exists
2. 18 Edit workout + 19 Swap exercise — used monthly, not daily
3. 04 Progress + Photo compare — the most numbers per pixel, the least urgency

---

## 7. Integration map

Every new thing and where it attaches. Nothing floats.

| New thing | Attachment |
|---|---|
| **Daily block (B1)** | **Dashboard:** own card directly above the Today card — first tappable thing after the week strip, because it's done before anything else. **Today:** first card in the morning stack (daily → body → food → commute → session). Row shows `4 of 9 · 11 min left` + 5px bar + `Continue`. Opens `dailyBlock` → `dailyTimer`. Displaces nothing; Dashboard grew 950→1064px, Today 1264→2335px. |
| **Pain logging (B2)** | **Diary:** replaces the single `Tendon pain, AM` 1–10 scale with a two-tile read-only summary (dorsiflexion / eversion, each with yesterday's value) + a row opening `painLog`. `Legs feel` stays as it was. **Today + Dashboard:** the existing amber warning row, recopied to `Pain not scored cold` / `Dorsiflexion + eversion · 4 taps`, `Log` button opens `painLog`. **Progress:** the tendon-pain sparkline row becomes `.sparkline--multi`. |
| **Warm-up (B3)** | Behind `Start warm-up` on Today's run block **and** `Start run` on Dashboard — both open `warmupPre`. Added a caption under `Start warm-up`: `FULL · 15 MIN · GARMIN RECORDS THE RUN`. |
| **Resume + set editing (B4)** | **Resume** is a state of Today's and Dashboard's lift primary: `Start lift` → `Resume Legs` + `6 SETS` pill + `STARTED 18:02 · PICKS UP AT RDL SET 3`. **Set editing** is a mode of 02 Active set, entered by tapping a done chip. **Pause** replaces the old exit on 02, with `Everything is saved as you go.` |
| **Settings (B5)** | Tab 4, gear icon, replacing Export. Export becomes a 52px secondary button on Progress above Weekly load, plus a second entry in Settings. |
| **Custom food (B6)** | `+ Custom` chip and `+ Custom food` row in the food overlay both open `customFood`. Save returns to 08. |
| **Edit / swap exercise (B7)** | The two existing secondary buttons on Today's lift block. Unchanged position; they now have destinations (18, 19). |
| **Rescheduling (B9)** | **Week:** every day row gained a 30px `⋮` after the status glyph → `Move to… / Skip · shorten / Duplicate`. `Swap days` renamed `Reorder week` → opens 23, which also holds Past weeks. **Today:** a second secondary pair under Edit/Swap — `Move to tomorrow` (→ 21 with tomorrow preselected) and `Skip · shorten` (→ 22). |


No new tabs. Four is still the ceiling.

---

## 8. Changed from v1

**Corrections (Part A)**

1. Legs cut from ten exercises to six, with real prescriptions, load units and RIR targets per row. Three disabled rows added beneath an `OFF THIS WEEK` divider, struck through with the amber reason in full opacity.
2. Every weight now names its unit (`40 kg total`, `52.5 kg stack`, `14 kg /hand`, `BW`). `/hand` shows the doubled total. Active Set's stepper caption is now `LOAD UNIT · TOTAL`.
3. RIR target chip added next to the set counter on Active Set (`RIR 2–3`).
4. Marathon projection rebuilt: `5:15–5:45`, `COMPUTED` tag, stats for current pace (7:38) and pace needed for sub-5 (7:06), amber verdict callout, and a provenance line `SCSM 5 DEC 2026 · 83 DAYS · FROM 18 RUNS`. The old green `3:47:20` and its encouraging note are gone.
5. Export simplified: Day/Week/Month → `Copy markdown` → scrollable markdown preview with a character count. PDF and .FIT dropped. Moved from tab to overlay.

**New screens (Part B)** — 10 Daily block · 11 Daily timer · 12 Pain log · 13 Warm-up · 14 Warm-up step · 15 Warm-up done · 16 Settings · 17 Custom food · 18 Edit workout · 19 Swap exercise · 20 Set editing · 21 Move session · 22 Change session · 23 Reorder week · 24 Lengthen guard.

**Structural**

1. Tab 4 is Settings (gear); Export moved to a Progress button. All 25 frames' nav bars updated.
2. `Start run` → warm-up. Run-in-progress removed as a concept, and the reason is stated on-screen: _"Garmin records the run. Nothing to start here."_
3. Diary's single pain scale replaced by the two-movement summary; pain capture moved to its own overlay.
4. Week day rows gained `⋮`; `Swap days` became `Reorder week`.
5. Today gained a second secondary pair (`Move to tomorrow`, `Skip · shorten`) and the daily-block row.
6. **Today consolidated into the cockpit (§4a).** Duplicate `Search food` pill deleted — one food card only, moved up into the morning stack. Body card expanded inline with writable AM/PM weight fields and AM/PM photo buttons instead of a collapsed drill-down row. Empty fields carry a dashed border so unfilled never reads as filled. Frame 1444→2335px (fitted to the taller Lift state, not the Run state).

**Component sheet** — nine new groups: countdown ring, hold/step pips, 0.5-step pain scale, multi-line sparkline, editing state, resume state, drag handle + day row, disabled exercise row, load unit, guardrail callout.

**Unchanged** — every token, both fonts, the mono/sans rule, all geometry, `.card`, `.bar`, single-line `.sparkline`, `.seg`, `.subtabs`, `.chip`, `.pill`, `.tierpill`, `.stat`, `.stepper`, `.photoslot`, the icon approach, Commute, Food log, Photo compare, Body check.

---

## 9. Open decisions

1. **Skip reasons — column or table?** A `plan_changes` table costs a migration but gives Move/Swap/Skip/Shorten one audit trail and makes _"third sore-skip in 4 weeks, all after a Friday lift"_ a single query. Two `skip_reason` columns are cheaper and can't answer that. **Recommend the table.**
2. **Does the daily block block anything?** Right now it's a row you can ignore forever. The brief calls it the single most important recurring action. Should an incomplete block at, say, 18:00 escalate — amber row, or a persistent banner? **Recommend** escalating the existing row to amber after 18:00 and leaving it at that; a banner would compete with the pain row in the morning, which owns that slot.
3. **Guardrail severity.** Four conditions all render the same amber. Should "no full rest day this week" and "long runs 4 days apart" look equally serious? **Recommend** keeping one amber level — grading them invites ignoring the lower one, and the callout copy already carries the weight.
4. **`Stack` two sessions on one day** — the mock offers it, but nothing downstream knows how to show two sessions on one Week row or one Today screen. **Recommend** Today shows both stacked with the harder first, Week row shows both pills; needs confirming before 21 is built.
5. **Past weeks depth.** 23 lists four weeks with adherence %. Tapping one — read-only history, or editable? **Recommend** read-only; editing the past corrupts the load calculations that `acwr()` depends on.
6. **Photo slots** are still placeholders. Real progress photos needed.
7. **Body fat 24.4%** has no column and no screen. Track it or drop it?

