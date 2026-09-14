# Phase 5 — logging depth

Build `v2.5 · logging depth`. Project Phase 5 corresponds to the design handoff's logging-depth phase, screens 06–09 and 17.

## Delivered

- Food log: daily calorie/protein targets, favourites, local food labels, search, meal groups, add, edit servings/meal and explicit delete confirmation. Custom foods include serving description, required calories/protein, optional carbs/fat and Save to my foods. Saved custom foods remain private and reusable. Saving returns to the food log.
- Serving edits retain the original nutrient basis so repeated edits do not accumulate rounding error. Optional unknown macros remain null. Stable IDs and an immediate save lock prevent duplicate retries. If saving a reusable food succeeds but its meal write fails, retry reuses that food ID.
- Commute: direction opens a form without creating a record. Distance/time required; Run/Bike/Walk, effort, carried load, optional HR and notes. Reuse the last matching mode/direction's distance/time. Save returns to Today and refreshes the current week's totals; existing trips can be edited or deleted explicitly.
- Diary: date navigation, today's/yesterday's cold pain values, read-only body and nutrition, legs feel, sleep, resting HR, daily note, session feel/notes and activity history for that day. Pain editing uses the selected date and preserves unsaved Diary fields when returning.
- Diary saves its daily and session fields atomically without overwriting body measurements.
- Export: exact inclusive Day/Week/Month ending-date ranges, clipboard with selectable fallback, activities and commutes, completed/in-progress lifting and daily-block sets with load units, pain-only dates, body/check-in fields, meals and meal-derived totals, schedule changes/reasons, and photo metadata. Legacy daily calories are separately labelled and never added to meal totals. Queries paginate past the API's first page; any failed read prevents a partial export.

## Data

Applied `phase5_logging_depth` to `hyrbazjlrmzerujmyuus`; SQL in `db/phase5-logging.sql`. Adds meal carbs/fat/nutrient basis and daily legs feel. `save_diary` is security invoker with fixed search path, authenticated-only, owner/date-scoped session writes.

Commute mode follows the app's existing data convention (`cycle` for Bike, `easy` for Run, `walk` for Walk), with `commute_direction` identifying a commute. This preserves existing views; no historical records are reclassified. Custom foods and training logs are independent between the two accounts.

## Validation

- 42 tests: original flows plus nutrition scaling, commute validation and failed saves, reusable-food retries, meal edit/delete totals, Diary failure handling, exact export dates, in-progress sets and pagination, and incomplete-export rejection.
- Production build passes.
- Authenticated database tests, all rolled back: Diary atomicity, body preservation, custom-food totals, and account isolation.
- Phone-sized synthetic component renders inspected for Commute, Diary and Food. Live read-only checks after release; no real meals, trips or check-ins created during testing.
- Existing Supabase advisor warnings remain outside this phase: legacy functions' [mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) and Auth leaked-password protection. New Diary function has a fixed search path.

## Next

Project Phase 6: Settings targets, workout editing/exercise swaps, Progress and photo comparison (the design handoff's long-tail phase).
