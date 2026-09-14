-- Occurrence-based scheduling; recurring workout templates and workout history stay intact.
alter table public.run_plan add column if not exists schedule_status text not null default 'scheduled'
  check (schedule_status in ('scheduled','skipped'));
alter table public.run_plan add column if not exists schedule_revision integer not null default 0;
alter table public.run_plan add column if not exists baseline_duration_min integer;
update public.run_plan set baseline_duration_min=duration_min where baseline_duration_min is null;
alter table public.sessions add column if not exists schedule_ref text;

create table if not exists public.lift_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  original_date date not null,
  date date not null,
  schedule_status text not null default 'scheduled' check (schedule_status in ('scheduled','skipped')),
  duration_min integer check (duration_min > 0 and duration_min <= 600),
  revision integer not null default 1,
  unique(user_id,workout_day_id,original_date)
);
alter table public.lift_schedule enable row level security;
create policy lift_schedule_own on public.lift_schedule to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id and exists(select 1 from public.workout_days d where d.id=workout_day_id and d.user_id=(select auth.uid()) and not d.is_daily));
grant select,insert,update on public.lift_schedule to authenticated;
revoke all on public.lift_schedule from anon;
create index if not exists lift_schedule_user_date on public.lift_schedule(user_id,date);

alter table public.plan_changes add column if not exists request_id uuid;
alter table public.plan_changes add column if not exists details jsonb;
alter table public.plan_changes drop constraint plan_changes_action_check;
alter table public.plan_changes add constraint plan_changes_action_check check
  (action in ('move','swap','stack','reorder','skip','shorten','lengthen','substitute','did_other','restore'));
create index if not exists plan_changes_user_request on public.plan_changes(user_id,request_id);

create or replace function public.save_schedule_changes(p_request_id uuid,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  uid uuid := auth.uid(); current_day date := (now() at time zone 'Asia/Singapore')::date;
  c jsonb; previous public.run_plan%rowtype; lift public.lift_schedule%rowtype; template public.workout_days%rowtype;
  ref text; original_day date; before_day date; target_day date; before_minutes integer; minutes integer;
  before_status text; status text; version integer; action text; reason text; counter integer:=0; request jsonb;
begin
  if uid is null then raise exception 'Sign in to change your programme'; end if;
  if p_request_id is null or p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes) not between 1 and 40 then raise exception 'Invalid schedule request'; end if;
  -- Serialize one account's batches; swaps/reorders are atomic, retries are idempotent.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select details->'request' into request from public.plan_changes where user_id=uid and request_id=p_request_id limit 1;
  if found then
    if request is distinct from p_changes then raise exception 'Request ID already used; reload and retry'; end if;
    return jsonb_build_object('saved',jsonb_array_length(p_changes),'already_saved',true);
  end if;
  if (select count(*) from jsonb_array_elements(p_changes)) <> (select count(distinct (v->>'kind')||':'||(v->>'id')||':'||coalesce(v->>'original_date','')) from jsonb_array_elements(p_changes)v) then raise exception 'A session appears twice in this request'; end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    action:=c->>'action'; reason:=nullif(c->>'reason','');
    if action is null or action not in ('move','swap','stack','reorder','skip','shorten','lengthen','did_other','restore') then raise exception 'Unsupported change'; end if;
    if action in ('skip','shorten','lengthen','did_other') and reason is null then raise exception 'Choose a reason'; end if;
    if c->>'kind'='run' then
      select * into previous from public.run_plan where id=(c->>'id')::uuid and user_id=uid for update;
      if not found then raise exception 'Session unavailable'; end if;
      ref:='run:'||previous.id; before_day:=previous.date; before_minutes:=previous.duration_min; before_status:=previous.schedule_status; version:=previous.schedule_revision;
      if exists(select 1 from public.runs r where r.user_id=uid and r.date=before_day and r.run_type=previous.run_type and r.commute_direction is null) then raise exception 'This session has a run log; keep history unchanged'; end if;
    elsif c->>'kind'='lift' then
      original_day:=(c->>'original_date')::date;
      select * into template from public.workout_days where id=(c->>'id')::uuid and user_id=uid and is_active and not is_daily;
      if not found or original_day is null or extract(isodow from original_day)<>template.weekday then raise exception 'Workout occurrence unavailable'; end if;
      select * into lift from public.lift_schedule where user_id=uid and workout_day_id=template.id and original_date=original_day for update;
      if found then before_day:=lift.date; before_minutes:=coalesce(lift.duration_min,template.est_minutes); before_status:=lift.schedule_status; version:=lift.revision;
      else before_day:=original_day; before_minutes:=template.est_minutes; before_status:='scheduled'; version:=0; end if;
      ref:='lift:'||template.id||':'||original_day;
      if exists(select 1 from public.sessions s where s.user_id=uid and s.workout_day_id=template.id and (s.schedule_ref=ref or (s.schedule_ref is null and s.date=before_day))) then raise exception 'This workout has already started; keep its history unchanged'; end if;
    else raise exception 'Unknown session type'; end if;
    if c->>'expected_revision' is null or version<>(c->>'expected_revision')::integer or before_day is distinct from (c->>'from_date')::date then raise exception 'Programme changed on another device. Reload before saving'; end if;
    target_day:=coalesce((c->>'to_date')::date,before_day);
    if before_day<current_day or target_day<current_day then raise exception 'Past sessions are read-only'; end if;
    if target_day>current_day+730 then raise exception 'Choose a date within the next two years'; end if;
    status:=coalesce(c->>'status',before_status); minutes:=coalesce((c->>'duration_min')::integer,before_minutes);
    if status not in ('scheduled','skipped') or (minutes is not null and (minutes<=0 or minutes>600)) then raise exception 'Invalid status or duration'; end if;
    if action='skip' and status<>'skipped' then raise exception 'Invalid skip'; end if;
    if action in ('move','swap','stack','reorder','restore') and minutes is distinct from before_minutes then raise exception 'Moving cannot change duration'; end if;
    if c->>'kind'='lift' and minutes is distinct from before_minutes then raise exception 'Adjust individual lift sets in the workout editor, not duration'; end if;
    if c->>'kind'='run' and previous.run_type='long' and minutes>before_minutes and minutes>ceil(coalesce(previous.baseline_duration_min,before_minutes)*1.1) and coalesce((c->>'ack_lengthen')::boolean,false)=false then raise exception 'Confirm the long-run increase above the programme cap'; end if;
    if c->>'kind'='run' then
      update public.run_plan set date=target_day,baseline_duration_min=coalesce(baseline_duration_min,before_minutes),duration_min=minutes,schedule_status=status,schedule_revision=version+1 where id=previous.id and user_id=uid;
    else
      insert into public.lift_schedule(user_id,workout_day_id,original_date,date,schedule_status,duration_min,revision)
      values(uid,template.id,original_day,target_day,status,minutes,version+1)
      on conflict(user_id,workout_day_id,original_date) do update set date=excluded.date,schedule_status=excluded.schedule_status,duration_min=excluded.duration_min,revision=excluded.revision;
    end if;
    if action='did_other' then
      if before_day<>current_day then raise exception 'Log a replacement activity on its actual day'; end if;
      if c->'actual'->>'run_type' is null or c->'actual'->>'run_type' not in ('easy','cycle','walk','threshold','long') or (c->'actual'->>'duration_min') is null or (c->'actual'->>'duration_min')::integer not between 1 and 600 then raise exception 'Enter the activity and its actual minutes'; end if;
      if status='scheduled' and target_day=before_day then raise exception 'Move or skip the replaced session'; end if;
      insert into public.runs(id,user_id,date,run_type,duration_min,notes)
      values(md5(p_request_id||':'||ref||':actual')::uuid,uid,current_day,c->'actual'->>'run_type',(c->'actual'->>'duration_min')::integer,nullif(c->>'note',''));
    end if;
    insert into public.plan_changes(id,user_id,date,session_ref,session_kind,action,reason,from_date,to_date,from_value,to_value,note,request_id,details)
    values(md5(p_request_id||':'||ref)::uuid,uid,current_day,ref,c->>'kind',action,reason,before_day,target_day,before_minutes,minutes,nullif(c->>'note',''),p_request_id,jsonb_build_object('request',p_changes,'before_status',before_status,'after_status',status));
    counter:=counter+1;
  end loop;
  return jsonb_build_object('saved',counter,'already_saved',false);
end;
$$;
revoke execute on function public.save_schedule_changes(uuid,jsonb) from public,anon;
grant execute on function public.save_schedule_changes(uuid,jsonb) to authenticated;
