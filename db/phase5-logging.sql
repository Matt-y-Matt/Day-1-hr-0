alter table public.meal_logs add column if not exists carbs_g numeric;
alter table public.meal_logs add column if not exists fat_g numeric;
alter table public.meal_logs add column if not exists nutrient_basis jsonb;
alter table public.daily_log add column if not exists legs_feel_1_10 integer check (legs_feel_1_10 between 1 and 10);

create or replace function public.save_diary(p_date date,p_daily jsonb,p_sessions jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; affected integer;
begin
  if uid is null or p_date is null or p_date>(now() at time zone 'Asia/Singapore')::date then raise exception 'Choose today or an earlier date'; end if;
  if p_daily is null or jsonb_typeof(p_daily)<>'object' or p_sessions is null or jsonb_typeof(p_sessions)<>'array' then raise exception 'Invalid diary'; end if;
  if (p_daily->>'sleep_hours')::numeric not between 0 and 24 or (p_daily->>'resting_hr')::integer not between 20 and 250 or (p_daily->>'legs_feel_1_10')::integer not between 1 and 10 then raise exception 'Check sleep, resting HR and legs feel'; end if;
  insert into public.daily_log(user_id,date,sleep_hours,resting_hr,legs_feel_1_10,note)
  values(uid,p_date,(p_daily->>'sleep_hours')::numeric,(p_daily->>'resting_hr')::integer,(p_daily->>'legs_feel_1_10')::integer,nullif(p_daily->>'note',''))
  on conflict(user_id,date) do update set sleep_hours=excluded.sleep_hours,resting_hr=excluded.resting_hr,legs_feel_1_10=excluded.legs_feel_1_10,note=excluded.note;
  for s in select value from jsonb_array_elements(p_sessions) loop
    if (s->>'feel_1_5')::integer not between 1 and 5 then raise exception 'Session feel must be 1 to 5'; end if;
    update public.sessions set feel_1_5=(s->>'feel_1_5')::integer,session_note=nullif(s->>'session_note','') where id=(s->>'id')::uuid and user_id=uid and date=p_date;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Session unavailable; reload Diary'; end if;
  end loop;
end $$;
revoke execute on function public.save_diary(date,jsonb,jsonb) from public,anon;
grant execute on function public.save_diary(date,jsonb,jsonb) to authenticated;
