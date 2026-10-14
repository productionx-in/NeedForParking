-- =============================================================================
-- 6. Hardening found by the Supabase security advisor on the first real deploy
--  * trigger function must not be reachable through the API roles
--  * pin search_path on every remaining function (all of them schema-qualify what they use)
-- The SECURITY DEFINER helpers that stay executable by anon/authenticated are intentional:
-- RLS policies and RPCs call them, and each returns only data about the caller / public listings.
-- =============================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter function public.ist_today()                       set search_path = '';
alter function public.is_privileged_session()           set search_path = '';
alter function public.tg_set_updated_at()               set search_path = '';
alter function public.snap_coordinate(double precision, double precision) set search_path = '';
alter function public.tg_profiles_guard()               set search_path = '';
alter function public.tg_listings_before_write()        set search_path = '';
alter function public.tg_photos_before_insert()         set search_path = '';
alter function public.tg_photos_before_delete()         set search_path = '';
alter function public.effective_days(date, date, smallint[]) set search_path = '';
alter function public.request_fits_availability(smallint[], boolean, time, time, date, date, smallint[], time, time) set search_path = '';
alter function public.request_windows_conflict(date, date, smallint[], time, time, date, date, smallint[], time, time) set search_path = '';
alter function public.tg_requests_before_insert()       set search_path = '';
alter function public.tg_requests_before_update()       set search_path = '';
alter function public.tg_reports_before_insert()        set search_path = '';
