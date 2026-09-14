alter table public.workout_days add column if not exists plan_revision integer not null default 0;
alter table public.sessions add column if not exists workout_snapshot jsonb;
update public.sessions s set workout_snapshot=(select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('exercises',to_jsonb(e)) order by w.order_index),'[]') from public.workout_exercises w join public.exercises e on e.id=w.exercise_id and e.user_id=s.user_id where w.workout_day_id=s.workout_day_id and w.user_id=s.user_id) where workout_snapshot is null;

create table public.workout_overrides (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 workout_day_id uuid not null references public.workout_days(id) on delete cascade,
 occurrence_ref text not null, date date not null, items jsonb not null, revision integer not null default 1,
 primary key(user_id,occurrence_ref)
);
alter table public.workout_overrides enable row level security;
create policy workout_overrides_own on public.workout_overrides to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.workout_days d where d.id=workout_day_id and d.user_id=(select auth.uid())));
grant select,insert,update on public.workout_overrides to authenticated;
revoke all on public.workout_overrides from anon;
create table public.workout_changes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 workout_day_id uuid not null references public.workout_days(id), date date not null, scope text not null,
 before_items jsonb not null, after_items jsonb not null, created_at timestamptz not null default now()
);
alter table public.workout_changes enable row level security;
create policy workout_changes_own on public.workout_changes to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert on public.workout_changes to authenticated;
revoke all on public.workout_changes from anon;

create or replace function public.save_workout(p_day uuid,p_scope text,p_ref text,p_revision integer,p_items jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); d public.workout_days%rowtype; w public.workout_exercises%rowtype; ex public.exercises%rowtype; x jsonb; before_json jsonb; normalized jsonb:='[]'; n integer:=0; version integer; current_day date:=(now() at time zone 'Asia/Singapore')::date; original_day date;
begin
 if uid is null then raise exception 'Sign in first'; end if;
 select * into d from public.workout_days where id=p_day and user_id=uid and is_active and not is_daily for update;
 if not found then raise exception 'Workout unavailable'; end if;
 if p_scope is null or p_scope not in ('programme','today') or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Invalid workout'; end if;
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('exercises',to_jsonb(e)) order by a.order_index),'[]') into before_json from public.workout_exercises a join public.exercises e on e.id=a.exercise_id and e.user_id=uid where a.workout_day_id=p_day and a.user_id=uid;
 version:=d.plan_revision;
 if p_scope='today' then
  if p_ref is null or p_ref not like 'lift:'||p_day||':%' then raise exception 'Invalid workout occurrence'; end if;
  original_day:=split_part(p_ref,':',3)::date;
  if extract(isodow from original_day)<>d.weekday or not (exists(select 1 from public.lift_schedule l where l.user_id=uid and l.workout_day_id=p_day and l.original_date=original_day and l.date=current_day and l.schedule_status='scheduled') or (original_day=current_day and not exists(select 1 from public.lift_schedule l where l.user_id=uid and l.workout_day_id=p_day and l.original_date=original_day))) then raise exception 'This workout is not scheduled today'; end if;
  if exists(select 1 from public.sessions s where s.user_id=uid and s.workout_day_id=p_day and (s.schedule_ref=p_ref or (s.schedule_ref is null and s.date=current_day))) then raise exception 'Already started. Edit the programme for future sessions instead'; end if;
  select o.items,o.revision into before_json,version from public.workout_overrides o where o.user_id=uid and o.occurrence_ref=p_ref;
  if not found then version:=0; select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('exercises',to_jsonb(e)) order by a.order_index),'[]') into before_json from public.workout_exercises a join public.exercises e on e.id=a.exercise_id where a.workout_day_id=p_day and a.user_id=uid; end if;
 end if;
 if p_revision is null or p_revision<>version then raise exception 'Workout changed on another device. Reload before saving'; end if;
 if jsonb_array_length(p_items)<>(select count(*) from public.workout_exercises where workout_day_id=p_day and user_id=uid) or (select count(distinct v->>'id') from jsonb_array_elements(p_items)v)<>jsonb_array_length(p_items) or (select count(distinct v->>'exercise_id') from jsonb_array_elements(p_items)v)<>jsonb_array_length(p_items) then raise exception 'Keep every workout slot and use each exercise only once'; end if;
 for x in select value from jsonb_array_elements(p_items) loop
  select * into w from public.workout_exercises where id=(x->>'id')::uuid and workout_day_id=p_day and user_id=uid;
  if not found then raise exception 'Workout item unavailable'; end if;
  select * into ex from public.exercises where id=(x->>'exercise_id')::uuid and user_id=uid and is_active;
  if not found then raise exception 'Exercise unavailable'; end if;
  if ex.id<>w.exercise_id and ex.category is distinct from (select category from public.exercises where id=w.exercise_id and user_id=uid) then raise exception 'Choose an exercise in the same category'; end if;
  if (x->>'sets') is null or (x->>'sets')::integer not between 1 and 20 or (x->>'rest_seconds') is null or (x->>'rest_seconds')::integer not between 0 and 1200 then raise exception 'Check sets and rest seconds'; end if;
  if (x->>'hold_seconds') is not null then
   if (x->>'hold_seconds')::integer not between 1 and 600 then raise exception 'Check hold seconds'; end if;
  elsif (x->>'rep_min') is null or (x->>'rep_max') is null or (x->>'rep_min')::integer not between 1 and 100 or (x->>'rep_max')::integer not between (x->>'rep_min')::integer and 100 then raise exception 'Check rep range'; end if;
  if x->>'is_enabled' is null or ((x->>'is_enabled')::boolean=false and length(trim(coalesce(x->>'disabled_reason','')))=0) then raise exception 'Give a reason for disabling an exercise'; end if;
  if (x->>'target_weight_kg')::numeric<0 or (x->>'target_weight_kg')::numeric>1000 then raise exception 'Check target load'; end if;
  normalized:=normalized||jsonb_build_array(to_jsonb(w)||x||jsonb_build_object('order_index',n,'exercises',to_jsonb(ex),'disabled_reason',case when (x->>'is_enabled')::boolean then null else x->>'disabled_reason' end));n:=n+1;
 end loop;
 if not exists(select 1 from jsonb_array_elements(normalized)v where (v->>'is_enabled')::boolean) then raise exception 'Keep at least one exercise enabled'; end if;
 if p_scope='today' then
  insert into public.workout_overrides(user_id,workout_day_id,occurrence_ref,date,items,revision) values(uid,p_day,p_ref,current_day,normalized,version+1) on conflict(user_id,occurrence_ref) do update set items=excluded.items,revision=excluded.revision;
 else
  for x in select value from jsonb_array_elements(normalized) loop
   update public.workout_exercises set exercise_id=(x->>'exercise_id')::uuid,order_index=(x->>'order_index')::integer,sets=(x->>'sets')::integer,rep_min=(x->>'rep_min')::integer,rep_max=(x->>'rep_max')::integer,hold_seconds=(x->>'hold_seconds')::integer,target_weight_kg=(x->>'target_weight_kg')::numeric,rest_seconds=(x->>'rest_seconds')::integer,is_enabled=(x->>'is_enabled')::boolean,disabled_reason=x->>'disabled_reason' where id=(x->>'id')::uuid and user_id=uid;
  end loop;
  update public.workout_days set plan_revision=plan_revision+1 where id=p_day and user_id=uid;
 end if;
 insert into public.workout_changes(user_id,workout_day_id,date,scope,before_items,after_items) values(uid,p_day,current_day,p_scope,before_json,normalized);
end $$;
revoke execute on function public.save_workout(uuid,text,text,integer,jsonb) from public,anon;
grant execute on function public.save_workout(uuid,text,text,integer,jsonb) to authenticated;
