-- Reviewed against PostgreSQL 17.6. No training rows or function bodies change.
-- Applied remotely through Supabase migration phase2_access_hardening.
alter view public.v_last_performance set (security_invoker = true);
alter view public.v_progression_suggestions set (security_invoker = true);
alter view public.v_weekly_running set (security_invoker = true);
alter view public.v_commute_weekly set (security_invoker = true);
alter view public.v_load_weekly set (security_invoker = true);
alter view public.v_session_intensity set (security_invoker = true);
alter view public.v_daily_nutrition set (security_invoker = true);
alter view public.v_daily_block_today set (security_invoker = true);

revoke execute on function public.admin_fill_start_weights() from public, anon, authenticated;
revoke execute on function public.admin_refresh_metadata() from public, anon, authenticated;
