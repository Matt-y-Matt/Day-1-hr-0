create or replace function public.marathon_projection()
returns table(basis text,pace_per_km numeric,projected_time text,verdict text)
language sql stable security invoker set search_path='' as $$
 with recent as (
  select duration_min/distance_km as pace from public.runs
  where user_id=(select auth.uid()) and run_type='long' and commute_direction is null
   and distance_km>0 and duration_min>0 and hr_avg is not null and hr_avg<=140
   and date<=(now() at time zone 'Asia/Singapore')::date
  order by date desc,created_at desc,id limit 3
 ), calc as (select avg(pace) as pace from recent)
 select 'Latest three qualifying long runs; assumes 45 seconds/km improvement'::text,round(pace,2),
  to_char(make_interval(mins=>greatest(0,round((pace-.75)*42.195)::int)),'HH24:MI'),
  'Heuristic estimate, not a measured race result'::text from calc where pace is not null;
$$;
create or replace function public.acwr()
returns table(acute integer,chronic_avg integer,ratio numeric,verdict text)
language sql stable security invoker set search_path='' as $$
 with records as (
  select user_id,date,exercise_load from public.runs
  union all select user_id,date,exercise_load from public.sessions where completed_at is not null
 ), totals as (
  select coalesce(sum(exercise_load) filter(where date>=(now() at time zone 'Asia/Singapore')::date-6),0)::int as acute,
   coalesce(sum(exercise_load),0)::numeric/4 as chronic
  from records where user_id=(select auth.uid()) and exercise_load is not null
   and date between (now() at time zone 'Asia/Singapore')::date-27 and (now() at time zone 'Asia/Singapore')::date
 ) select acute,round(chronic)::int,case when chronic>0 then round(acute/chronic,2) end,
 'Recorded load only; missing entries limit the comparison'::text from totals;
$$;
revoke execute on function public.marathon_projection(),public.acwr() from public,anon;
grant execute on function public.marathon_projection(),public.acwr() to authenticated;
