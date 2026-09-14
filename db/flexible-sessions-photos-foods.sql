alter table public.photos add column if not exists pose text check (pose in ('front','back','arm'));
alter table public.foods add column if not exists is_archived boolean not null default false;

create or replace function public.add_session_set(p_session uuid, p_exercise uuid, p_expected_sets integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; position integer; current_sets integer;
begin
 if auth.uid() is null or p_expected_sets is null or p_expected_sets < 1 or p_expected_sets >= 50 then
  raise exception 'Invalid extra set request';
 end if;
 select workout_snapshot into snapshot from public.sessions
 where id=p_session and user_id=auth.uid() for update;
 if not found or snapshot is null then raise exception 'Session unavailable. Reopen the workout.'; end if;
 select (ordinality-1)::integer,(value->>'sets')::integer into position,current_sets
 from jsonb_array_elements(snapshot) with ordinality
 where value->>'exercise_id'=p_exercise::text and (value->>'is_enabled')::boolean;
 if position is null then raise exception 'Exercise unavailable in this session'; end if;
 -- Retrying the same expected count never appends twice.
 if current_sets=p_expected_sets+1 then return snapshot; end if;
 if current_sets<>p_expected_sets then raise exception 'Sets changed on another device. Reopen the workout.'; end if;
 snapshot=jsonb_set(snapshot,array[position::text,'sets'],to_jsonb(current_sets+1));
 update public.sessions set workout_snapshot=snapshot,completed_at=null where id=p_session and user_id=auth.uid();
 return snapshot;
end $$;
revoke all on function public.add_session_set(uuid,uuid,integer) from public,anon;
grant execute on function public.add_session_set(uuid,uuid,integer) to authenticated;

