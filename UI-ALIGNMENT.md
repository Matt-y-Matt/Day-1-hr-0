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

Inspected the reference and rendered components at 390px. Checked eleven populated/synthetic flows for horizontal overflow. Production verification follows deployment. Functional tests cover real components against an in-memory transport; they do not insert production training data.

Mockup example records, OS status bar, static device frame, sample health claims and invented deltas are not production content. Additional working controls and missing-data states use the reference's visual language. Application content scrolls normally; it is not clipped to the mockup's fixed canvas heights.

## Future changes

Use the standalone screen for layout comparisons before changing components. `components/standalone.css` is the final shared presentation layer after feature styles. Do not restore generic form defaults or insert extra page-level tools above screen headers. Compare screenshots at the same viewport width and preserve data, loading, error and keyboard states.

Validation: 55 tests passed; Next production build passed.
