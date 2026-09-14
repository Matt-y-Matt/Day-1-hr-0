# Phase 2: daily training path

Implemented on 14 September 2026 using Astra with low reasoning, following the
user-confirmed scope from the linked Claude handover. The same work is called
Phase 1 in `design/handoff-v2.md`; this naming mismatch is intentional and resolved.

## Delivered

- Dashboard is the default. Four main tabs: Dashboard, Week, Diary, Settings.
  Today and Progress remain Dashboard subviews. Existing logging and export are
  reachable from Settings, and existing gym sessions remain available.
- Pain is the first prominent action. Dorsiflexion and eversion have independent
  0–10 scales in half steps, explicit missing states, paired atomic saves, stable
  IDs for retry, optional knee reading, and a 14-day trend with missing-data gaps.
- Today's run opens the prescribed warm-up directly. Warm-up steps use absolute
  deadlines, catch up after backgrounding, and support pause, resume, skip, reset.
- Daily routines read active `is_daily` workout days and their exercise rows.
  Holds and rep sets are logged explicitly, with session resume, prescribed rest,
  first-missing-set detection, and completion only after all available prescribed
  items are complete. Unreadable exercise references prevent false completion.
- The timer sound preference reads and writes `user_settings.beep_enabled`.
  Browser audio still requires a user gesture and may be suspended on a locked
  phone. No background notification service was added.
- Overlays preserve their origin, support browser Back and Escape, trap keyboard
  focus, and return warm-up completion to Today. Timers and controls have room
  above the bottom navigation and phone safe area.
- Failed writes surface errors. Legacy general log saves now check responses
  instead of displaying success unconditionally. Supabase dependency is pinned.

## Verification

`npm test` mounts the real PainLog/DailyBlock components against an isolated
in-memory transport and tests timer/date/progress helpers. Covered cases include
missing versus zero, repeated save taps, failures, partial set/session saves,
missing set numbers, unavailable exercise references, expired holds, malformed
timer storage, pause/resume and multi-step background elapsed time.

The production build compiles successfully. The local production app was opened
at phone width and showed the expected sign-in screen with no browser console
errors. No passwords were requested or used; authenticated live UI writes have
not been smoke-tested. No real training records were used as test fixtures.

## Release gates and existing issues

1. Live read-only queries confirm a programme divided between two sign-ins, with
   24 workout-exercise entries referencing an exercise or day owned by the other
   account. The user
   has not selected a consolidation destination. Do not transfer, duplicate, or
   delete account data based only on the handover's recommendation. Missing
   routines are displayed honestly per account.
   The existing lifting record also contains four duplicate exercise/set-number
   groups. No historical sets were deleted or merged, and no conflicting unique
   constraint was imposed on that history.
2. The pre-existing access holes were fixed in live Supabase by migration
   `phase2_access_hardening`: eight views now use caller RLS, and browser roles
   cannot execute either admin function. See `db/phase2-access-hardening.sql`.
   All eight views were queried under both account roles with zero foreign-user
   rows; anonymous view reads returned zero rows. Training row counts remained
   unchanged. Security advisors now have no ERROR findings; eleven function
   search-path warnings and disabled leaked-password protection remain for a
   separate review. Do not mark the whole project security-clean.
3. GitHub reports a successful existing production deployment for base commit
   `5afd99b853703ee00e75807a924cafffe5ff006f`. The connected Vercel tool returned
   an empty project list, and its protected deployment required browser sign-in.
   Existing deployment success is not evidence that this branch is deployed.
4. A signed-in phone smoke test is still needed: score both movements; refresh;
   start/pause/resume warm-up; background the phone; log a daily set; reopen it;
   finish a routine; confirm the Dashboard and stored rows agree.

## Following phase

The next design-spec phase is the gym loop: Today body measurements/photos,
Active Set redesign and editing, rest screen, and read-only Week redesign.
Rescheduling, full food logging, workout editing and photo comparison are later.
The current gym logger's pre-existing behavior was retained apart from shared
rest timer integration; it has not received the next-phase redesign or full audit.

## Source of truth

Use the live database and current source for behavior, this file for delivered
scope and verification, and `design/handoff-v2.md` for the design contracts.
Do not treat illustrative mock values as training records or automatically apply
progression or injury-related programme changes.
