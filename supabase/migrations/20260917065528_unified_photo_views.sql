-- Preserve legacy photos while new uploads use a single collection per day.
ALTER TABLE public.photos DROP CONSTRAINT photos_slot_check;
ALTER TABLE public.photos ADD CONSTRAINT photos_slot_check
  CHECK (slot IN ('am', 'pm', 'photo'));
