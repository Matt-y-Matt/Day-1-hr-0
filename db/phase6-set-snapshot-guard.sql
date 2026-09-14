create or replace function public.check_set_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare prescription jsonb;
begin
 select s.workout_snapshot into prescription from public.sessions s where s.id=new.session_id and s.user_id=new.user_id;
 if prescription is not null and not exists(select 1 from jsonb_array_elements(prescription)x where x->>'exercise_id'=new.exercise_id::text and (x->>'is_enabled')::boolean and new.set_number between 1 and (x->>'sets')::integer) then
  raise exception 'Workout changed on another device. Reopen this session to resume its saved prescription';
 end if;
 return new;
end $$;
revoke execute on function public.check_set_snapshot() from public,anon;
create trigger set_snapshot_guard before insert on public.set_logs for each row execute function public.check_set_snapshot();
