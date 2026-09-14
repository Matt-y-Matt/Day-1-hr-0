# Standalone UI alignment — v2.6.1

The visual source of truth is `design/Training_Tracker_-_standalone.html`, not the phase implementation's previous screenshots. Its unpacked template matches the original Downloads HTML exactly (SHA256 de276577e9268ff01fc65b636de1cb54590156140dc1c9a5ab96d982794f94d7).

## What changed

- Shared 390px application column, matching bottom navigation width, original IBM Plex fonts, typography scale, card surfaces, radii, spacing and SVG navigation icons.
- Dashboard restored to date/title/avatar, week strip, daily routine, session actions, lift chart and key lift tiles. Chart values come from saved sets; empty history stays empty.
- Today/Progress are two subtabs with horizontal touch navigation. Today preserves the specified cockpit order and one food entry point.
- Compact body fields/photo slots, food bars/search/chips, commute actions and two-line exercise rows. Tier A is amber, B is blue.
- Active set uses large typed stepper values, explicit units, original set-chip geometry and edit-state colours. Existing pause/finish/exercise navigation remains available below logging controls.
- Week uses individual day cards with native stacked session entries and recorded summary values. Dashboard calendar links retain the selected week.
- Settings uses grouped inline numeric rows, paired HR bands and an account card. Race fields are under an expandable row.
- Workout editor uses a grouped exercise list, enable switches, compact prescriptions and expandable load/rest fields. Existing atomic saves, scope checks and session snapshots are unchanged.
- Pain, daily routine, timers, food, commute, diary, export and scheduling share the same field/button/card rules.

## Visual review and limits

Inspected the reference and rendered components at 390px. Checked eleven populated/synthetic flows for horizontal overflow. Signed-in production Dashboard, Today and active set verified after deployment. Screen changes return to the top; overlays lock background scrolling. Functional tests cover real components against an in-memory transport; they do not insert production training data.

Mockup example records, OS status bar, static device frame, sample health claims and invented deltas are not production content. Additional working controls and missing-data states use the reference's visual language. Application content scrolls normally; it is not clipped to the mockup's fixed canvas heights.

## Future changes

Use the standalone screen for layout comparisons before changing components. `components/standalone.css` is the final shared presentation layer after feature styles. Do not restore generic form defaults or insert extra page-level tools above screen headers. Compare screenshots at the same viewport width and preserve data, loading, error and keyboard states.

Validation: 55 tests passed; Next production build passed.


## v2.6.2 - flexible training

- Removed the Key lifts tiles; retained the recorded Lift progress chart. Bottom clearance now follows navigation height and safe area.
- Today renders its cockpit immediately, while independent programme/settings/pain/card reads run concurrently. Dashboard no longer fetches unused run rows or duplicate base lift prescriptions; session history and suggestions load concurrently. Writes in overlays refresh the underlying screen only when the overlay closes.
- Rings use fractional remaining milliseconds with continuous interpolation. Only timer transitions/deadline changes write local storage, not every tick.
- Daily completed holds can be explicitly logged without running a timer. Rest continues into the next missing set/exercise, including restored rests.
- Six optional photo views (AM/PM x front/back/arm), each with camera and upload. Body auto-collapse now requires both weights and all six views. Old photos remain under Previous photos in Progress; views compare separately.
- Extra sets extend only the current session snapshot through an owner-scoped, retry-safe RPC. They do not modify future prescriptions. RIR has minus/plus controls (0-10).
- Deleting custom foods archives them out of searches/favourites; past meal names and nutrition remain available.
- Database migration: db/flexible-sessions-photos-foods.sql. Verified extra sets, retry idempotence, set guard, pose storage, archives and cross-account isolation in a rolled-back transaction.
