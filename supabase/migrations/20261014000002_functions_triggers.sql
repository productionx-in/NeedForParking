-- =============================================================================
-- 2. Helper functions and triggers (business rules enforced in the database)
--
-- Conventions
--  * SECURITY DEFINER functions always `set search_path = ''` and schema-qualify.
--  * Guard triggers are SECURITY INVOKER so that current_user reflects the real caller
--    (anon / authenticated / service_role / postgres). They only reach other tables via
--    narrowly-scoped definer helpers.
--  * Errors that the app maps to friendly messages use short machine codes as the
--    exception message (e.g. 'slot_taken').
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create function public.ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- True for the database owner / service role. Evaluated in invoker context on purpose.
create function public.is_privileged_session() returns boolean
language sql stable as $$ select current_user in ('postgres', 'supabase_admin', 'service_role') $$;

create function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Rounds a coordinate to the centre of a ~0.004 degree (~430 m) grid cell.
create function public.snap_coordinate(v double precision, step double precision default 0.004)
returns double precision language sql immutable as $$
  select round(((floor(v / step) + 0.5) * step)::numeric, 6)::double precision
$$;

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by RLS policies; never trust client-supplied roles)
-- ---------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.account_status = 'active'
  )
$$;

create function public.is_account_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active'
  )
$$;

-- A verified phone session on an active account. Required for creating listings/requests/reports.
create function public.can_transact() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = auth.uid()
        and u.phone_confirmed_at is not null
        and coalesce(u.phone, '') <> ''
        and p.account_status = 'active'
    )
$$;

create function public.owns_listing(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parking_listings l where l.id = p_listing_id and l.owner_id = auth.uid()
  )
$$;

create function public.owner_is_active(p_owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_owner_id and p.account_status = 'active')
$$;

create function public.is_listing_public(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.parking_listings l
    join public.profiles p on p.id = l.owner_id
    where l.id = p_listing_id
      and l.status = 'published'
      and l.moderation_status = 'ok'
      and p.account_status = 'active'
  )
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile row
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- profiles guards
-- ---------------------------------------------------------------------------
create function public.tg_profiles_guard() returns trigger
language plpgsql as $$
begin
  if not public.is_privileged_session() then
    if new.id <> old.id
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.suspension_reason is distinct from old.suspension_reason
       or new.is_demo is distinct from old.is_demo then
      raise exception 'protected_profile_fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Public location computation (clients can never write latitude/longitude/public_address)
-- ---------------------------------------------------------------------------
create function public.recompute_public_location(p_listing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.parking_listings l
     set latitude = case
           when d.exact_latitude is null then null
           when l.location_privacy = 'exact' then d.exact_latitude
           else public.snap_coordinate(d.exact_latitude) end,
         longitude = case
           when d.exact_longitude is null then null
           when l.location_privacy = 'exact' then d.exact_longitude
           else public.snap_coordinate(d.exact_longitude) end,
         public_address = case when l.show_address_publicly then d.address_line else null end
    from public.listing_private_details d
   where d.listing_id = l.id and l.id = p_listing_id;
end $$;
revoke execute on function public.recompute_public_location(uuid) from public, anon, authenticated;

create function public.tg_private_details_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_public_location(new.listing_id);
  return null;
end $$;
revoke execute on function public.tg_private_details_after_write() from public, anon, authenticated;

create trigger private_details_after_write
  after insert or update on public.listing_private_details
  for each row execute function public.tg_private_details_after_write();
create trigger private_details_updated_at before update on public.listing_private_details
  for each row execute function public.tg_set_updated_at();

create function public.tg_listings_privacy_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_public_location(new.id);
  return null;
end $$;
revoke execute on function public.tg_listings_privacy_changed() from public, anon, authenticated;

create trigger listings_privacy_changed
  after update of location_privacy, show_address_publicly on public.parking_listings
  for each row execute function public.tg_listings_privacy_changed();

-- ---------------------------------------------------------------------------
-- parking_listings guard: immutability, status machine, publish validation
-- ---------------------------------------------------------------------------
create function public.tg_listings_before_write() returns trigger
language plpgsql as $$
declare
  errs text[] := '{}';
  photo_count integer;
  priv record;
begin
  if tg_op = 'INSERT' then
    if not public.is_privileged_session() then
      if new.status <> 'draft' then
        raise exception 'new_listing_must_be_draft' using errcode = 'check_violation';
      end if;
      -- Server-controlled columns can never be set by clients.
      new.moderation_status := 'ok';
      new.moderation_note := null;
      new.is_demo := false;
      new.latitude := null;
      new.longitude := null;
      new.public_address := null;
    end if;
  else
    if new.owner_id <> old.owner_id then
      raise exception 'owner_id_immutable' using errcode = '42501';
    end if;
    if not public.is_privileged_session() and (
         new.moderation_status is distinct from old.moderation_status
         or new.moderation_note is distinct from old.moderation_note
         or new.is_demo is distinct from old.is_demo) then
      raise exception 'protected_listing_fields' using errcode = '42501';
    end if;
    if new.status <> old.status and not (
         (old.status = 'draft'     and new.status in ('published', 'removed'))
      or (old.status = 'published' and new.status in ('paused', 'removed'))
      or (old.status = 'paused'    and new.status in ('published', 'removed'))) then
      raise exception 'invalid_status_transition: % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
  end if;

  -- Privileged maintenance (admin moderation, location recompute) of an already-published row skips re-validation.
  if new.status = 'published'
     and not (tg_op = 'UPDATE' and old.status = 'published' and public.is_privileged_session()) then
    select * into priv from public.listing_private_details d where d.listing_id = new.id;
    select count(*) into photo_count from public.listing_photos ph where ph.listing_id = new.id;

    if char_length(btrim(new.title)) < 5 then errs := array_append(errs, 'title (min 5 characters)'); end if;
    if char_length(btrim(new.description)) < 20 then errs := array_append(errs, 'description (min 20 characters)'); end if;
    if cardinality(new.vehicle_types) = 0 then errs := array_append(errs, 'vehicle types'); end if;
    if new.cover_type is null then errs := array_append(errs, 'covered/open'); end if;
    if new.locality is null then errs := array_append(errs, 'locality'); end if;
    if new.postal_code is null then errs := array_append(errs, 'postal code'); end if;
    if priv.listing_id is null or priv.address_line is null then errs := array_append(errs, 'address'); end if;
    if priv.listing_id is null or priv.exact_latitude is null or priv.exact_longitude is null then errs := array_append(errs, 'map location'); end if;
    if new.rental_type is null then errs := array_append(errs, 'rental type'); end if;
    if new.price_inr is null then errs := array_append(errs, 'price'); end if;
    if new.min_duration is null then errs := array_append(errs, 'minimum duration'); end if;
    if cardinality(new.available_days) = 0 then errs := array_append(errs, 'available days'); end if;
    if not new.access_24h and (new.available_from is null or new.available_to is null) then errs := array_append(errs, 'access hours'); end if;
    if not new.owner_declaration then errs := array_append(errs, 'ownership declaration'); end if;
    if new.permission_status = 'unconfirmed' then errs := array_append(errs, 'property/community permission confirmation'); end if;
    if photo_count = 0 and not new.is_demo then errs := array_append(errs, 'at least one photo'); end if;

    if cardinality(errs) > 0 then
      raise exception 'publish_validation: %', array_to_string(errs, ', ') using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or old.status <> 'published' then
      new.published_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger listings_before_write before insert or update on public.parking_listings
  for each row execute function public.tg_listings_before_write();
create trigger listings_updated_at before update on public.parking_listings
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- listing_photos guards
-- ---------------------------------------------------------------------------
create function public.listing_owner_of(p_listing_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.owner_id from public.parking_listings l where l.id = p_listing_id
$$;
revoke execute on function public.listing_owner_of(uuid) from public, anon;
grant execute on function public.listing_owner_of(uuid) to authenticated, service_role;

create function public.tg_photos_before_insert() returns trigger
language plpgsql as $$
declare
  v_owner uuid := public.listing_owner_of(new.listing_id);
  v_count integer;
begin
  -- Path layout is <owner_id>/<listing_id>/<file>; it must match the listing being attached to.
  if v_owner is null
     or split_part(new.storage_path, '/', 1) <> v_owner::text
     or split_part(new.storage_path, '/', 2) <> new.listing_id::text
     or split_part(new.storage_path, '/', 3) = ''
     or array_length(string_to_array(new.storage_path, '/'), 1) <> 3 then
    raise exception 'invalid_photo_path' using errcode = 'check_violation';
  end if;
  select count(*) into v_count from public.listing_photos where listing_id = new.listing_id;
  if v_count >= 10 then
    raise exception 'photo_limit_reached' using errcode = 'check_violation';
  end if;
  if new.position = 0 then new.position := least(v_count, 20); end if;
  return new;
end $$;

create trigger photos_before_insert before insert on public.listing_photos
  for each row execute function public.tg_photos_before_insert();

-- A published (non-demo) listing must always keep at least one photo.
create function public.tg_photos_before_delete() returns trigger
language plpgsql as $$
declare
  v_published boolean;
  v_demo boolean;
  v_remaining integer;
begin
  select (l.status = 'published'), l.is_demo into v_published, v_demo
    from public.parking_listings l where l.id = old.listing_id;
  -- When the whole listing is being deleted (cascade) the parent row is already gone.
  if coalesce(v_published, false) and not coalesce(v_demo, false)
     and not public.is_privileged_session() and not public.is_admin() then
    select count(*) into v_remaining from public.listing_photos where listing_id = old.listing_id and id <> old.id;
    if v_remaining = 0 then
      raise exception 'published_listing_needs_photo' using errcode = 'check_violation';
    end if;
  end if;
  return old;
end $$;

create trigger photos_before_delete before delete on public.listing_photos
  for each row execute function public.tg_photos_before_delete();

-- ---------------------------------------------------------------------------
-- Booking-request rules
-- ---------------------------------------------------------------------------
-- Days of week (0=Sunday) a request actually touches. One-time requests of 7+ days touch every day.
create function public.effective_days(p_start date, p_end date, p_days smallint[]) returns smallint[]
language sql immutable as $$
  select case
    when p_days is not null then p_days
    when p_end is null or p_end - p_start >= 6 then array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    else (select array_agg(distinct extract(dow from d)::smallint)
            from generate_series(p_start, p_end, interval '1 day') as d)
  end
$$;

-- Does a requested slot fit inside the listing's declared availability?
create function public.request_fits_availability(
  p_listing_days smallint[], p_access_24h boolean, p_av_from time, p_av_to time,
  p_start date, p_end date, p_days smallint[], p_from time, p_to time
) returns boolean language sql immutable as $$
  select public.effective_days(p_start, p_end, p_days) <@ p_listing_days
     and (
       p_access_24h
       or p_from is null or p_av_from is null or p_av_to is null
       or case
            when p_av_from < p_av_to then p_from >= p_av_from and p_to <= p_av_to
            else (p_from >= p_av_from or p_to <= p_av_to)   -- window crosses midnight
          end
     )
$$;

-- Do two requested slots overlap? date range AND at least one shared weekday-date AND overlapping time-of-day.
-- A NULL time window means "the whole availability window / day".
create function public.request_windows_conflict(
  a_start date, a_end date, a_days smallint[], a_from time, a_to time,
  b_start date, b_end date, b_days smallint[], b_from time, b_to time
) returns boolean language sql immutable as $$
  select (a_from is null or b_from is null or (a_from < b_to and b_from < a_to))
     and exists (
       select 1
       from generate_series(
              greatest(a_start, b_start),
              least(coalesce(a_end, greatest(a_start, b_start) + 400), coalesce(b_end, greatest(a_start, b_start) + 400)),
              interval '1 day') as d
       where (a_days is null or extract(dow from d)::smallint = any (a_days))
         and (b_days is null or extract(dow from d)::smallint = any (b_days))
     )
$$;

create function public.request_conflict_exists(
  p_listing uuid, p_requester uuid, p_statuses text[],
  p_start date, p_end date, p_days smallint[], p_from time, p_to time, p_exclude uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_requests r
    where r.listing_id = p_listing
      and (p_requester is null or r.requester_id = p_requester)
      and r.status = any (p_statuses)
      and (p_exclude is null or r.id <> p_exclude)
      and public.request_windows_conflict(p_start, p_end, p_days, p_from, p_to,
                                          r.start_date, r.end_date, r.recurring_days, r.start_time, r.end_time)
  )
$$;
revoke execute on function public.request_conflict_exists(uuid, uuid, text[], date, date, smallint[], time, time, uuid) from public, anon, authenticated;

-- Returns NULL when a new request is acceptable, otherwise a machine code.
create function public.validate_request_target(
  p_listing uuid, p_requester uuid, p_schedule_type text, p_vehicle text,
  p_start date, p_end date, p_days smallint[], p_from time, p_to time
) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  l record;
begin
  select pl.*, (pr.account_status = 'active') as owner_active
    into l
    from public.parking_listings pl
    join public.profiles pr on pr.id = pl.owner_id
   where pl.id = p_listing;

  if not found then return 'listing_unavailable'; end if;
  if l.owner_id = p_requester then return 'own_listing'; end if;
  if l.status <> 'published' or l.moderation_status <> 'ok' or not l.owner_active then return 'listing_unavailable'; end if;
  if l.is_demo then return 'demo_listing'; end if;
  if p_start < public.ist_today() then return 'past_date'; end if;
  if not (p_vehicle = any (l.vehicle_types)) then return 'vehicle_unsupported'; end if;
  if not public.request_fits_availability(l.available_days, l.access_24h, l.available_from, l.available_to,
                                          p_start, p_end, p_days, p_from, p_to) then
    return 'outside_availability';
  end if;

  -- Minimum rental duration (units follow the listing's rental type).
  if l.min_duration is not null then
    if l.rental_type = 'hourly' and p_from is not null
       and extract(epoch from (p_to - p_from)) / 3600.0 < l.min_duration then
      return 'below_minimum_duration';
    elsif l.rental_type = 'daily' and p_schedule_type = 'one_time' and (p_end - p_start + 1) < l.min_duration then
      return 'below_minimum_duration';
    elsif l.rental_type = 'monthly' and p_schedule_type = 'one_time' and (p_end - p_start + 1) < l.min_duration * 28 then
      return 'below_minimum_duration';
    end if;
  end if;

  if public.request_conflict_exists(p_listing, null, array['accepted'], p_start, p_end, p_days, p_from, p_to) then
    return 'slot_taken';
  end if;
  if public.request_conflict_exists(p_listing, p_requester, array['pending', 'accepted'], p_start, p_end, p_days, p_from, p_to) then
    return 'duplicate_request';
  end if;
  return null;
end $$;
revoke execute on function public.validate_request_target(uuid, uuid, text, text, date, date, smallint[], time, time) from public, anon;
grant execute on function public.validate_request_target(uuid, uuid, text, text, date, date, smallint[], time, time) to authenticated, service_role;

-- Run when an owner accepts a request. Serialises concurrent accepts per listing.
create function public.check_accept_allowed(p_request_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  l record;
begin
  select * into r from public.booking_requests where id = p_request_id;
  if not found then return 'request_not_found'; end if;
  -- Only the listing owner (or a service-role caller, where auth.uid() is null) may probe this.
  if auth.uid() is not null and not exists (
       select 1 from public.parking_listings pl where pl.id = r.listing_id and pl.owner_id = auth.uid()) then
    return 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(r.listing_id::text, 0));
  select pl.*, (pr.account_status = 'active') as owner_active
    into l from public.parking_listings pl join public.profiles pr on pr.id = pl.owner_id
   where pl.id = r.listing_id;
  if not found or l.status <> 'published' or l.moderation_status <> 'ok' or not l.owner_active then
    return 'listing_unavailable';
  end if;
  if l.is_demo then return 'demo_listing'; end if;
  if r.end_date is not null and r.end_date < public.ist_today() then return 'request_expired'; end if;
  if public.request_conflict_exists(r.listing_id, null, array['accepted'], r.start_date, r.end_date,
                                    r.recurring_days, r.start_time, r.end_time, r.id) then
    return 'slot_taken';
  end if;
  return null;
end $$;
revoke execute on function public.check_accept_allowed(uuid) from public, anon;
grant execute on function public.check_accept_allowed(uuid) to authenticated, service_role;

create function public.tg_requests_before_insert() returns trigger
language plpgsql as $$
declare
  v_code text;
  v_pending integer;
begin
  if new.status <> 'pending' then
    raise exception 'new_request_must_be_pending' using errcode = 'check_violation';
  end if;
  new.owner_response := null;
  new.responded_at := null;

  -- Structurally invalid rows are left for the CHECK constraints to reject with a precise error.
  if (new.end_date is not null and new.end_date < new.start_date)
     or (new.end_date is not null and new.end_date - new.start_date > 366)
     or (new.schedule_type = 'one_time' and (new.end_date is null or new.recurring_days is not null))
     or (new.schedule_type = 'recurring' and (new.recurring_days is null
           or cardinality(new.recurring_days) not between 1 and 7
           or not (new.recurring_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])))
     or ((new.start_time is null) <> (new.end_time is null))
     or coalesce(new.start_time >= new.end_time, false) then
    return new;
  end if;

  -- Serialise inserts per listing so two racing requests cannot both slip past conflict checks.
  perform pg_advisory_xact_lock(hashtextextended(new.listing_id::text, 0));

  v_code := public.validate_request_target(new.listing_id, new.requester_id, new.schedule_type, new.vehicle_type,
                                           new.start_date, new.end_date, new.recurring_days, new.start_time, new.end_time);
  if v_code is not null then
    raise exception '%', v_code using errcode = 'P0001';
  end if;

  select count(*) into v_pending from public.booking_requests where requester_id = new.requester_id and status = 'pending';
  if v_pending >= 20 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger requests_before_insert before insert on public.booking_requests
  for each row execute function public.tg_requests_before_insert();

create function public.tg_requests_before_update() returns trigger
language plpgsql as $$
declare
  v_actor text;
  v_code text;
begin
  if not public.is_privileged_session() and (new.listing_id, new.requester_id, new.schedule_type, new.start_date, new.end_date, new.start_time,
      new.end_time, new.recurring_days, new.vehicle_type, new.message, new.created_at)
     is distinct from
     (old.listing_id, old.requester_id, old.schedule_type, old.start_date, old.end_date, old.start_time,
      old.end_time, old.recurring_days, old.vehicle_type, old.message, old.created_at) then
    raise exception 'immutable_request_fields' using errcode = '42501';
  end if;

  if public.is_privileged_session() then
    v_actor := 'privileged';
  elsif auth.uid() = old.requester_id then
    v_actor := 'requester';
  elsif public.owns_listing(old.listing_id) then
    v_actor := 'owner';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_actor = 'requester' and (new.owner_response is distinct from old.owner_response
                                or new.responded_at is distinct from old.responded_at) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if new.status = old.status then
    if v_actor = 'owner' and new.owner_response is distinct from old.owner_response then
      raise exception 'response_requires_status_change' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if v_actor <> 'privileged' and not (
       (v_actor = 'requester' and old.status in ('pending', 'accepted') and new.status = 'cancelled')
    or (v_actor = 'owner' and old.status = 'pending'  and new.status in ('accepted', 'declined'))
    or (v_actor = 'owner' and old.status = 'accepted' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'invalid_status_transition: % -> % by %', old.status, new.status, v_actor using errcode = 'check_violation';
  end if;

  if v_actor = 'owner' and old.status = 'accepted' and new.status = 'completed'
     and old.start_date > public.ist_today() then
    raise exception 'cannot_complete_before_start' using errcode = 'check_violation';
  end if;

  if new.status = 'accepted' then
    v_code := public.check_accept_allowed(old.id);
    if v_code is not null then
      raise exception '%', v_code using errcode = 'P0001';
    end if;
  end if;

  if v_actor in ('owner', 'privileged') then
    new.responded_at := now();
  end if;
  return new;
end $$;

create trigger requests_before_update before update on public.booking_requests
  for each row execute function public.tg_requests_before_update();
create trigger requests_updated_at before update on public.booking_requests
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- favorites / reports guards
-- ---------------------------------------------------------------------------
create function public.tg_reports_before_insert() returns trigger
language plpgsql as $$
declare
  v_recent integer;
begin
  if public.owns_listing(new.listing_id) then
    raise exception 'own_listing' using errcode = 'P0001';
  end if;
  select count(*) into v_recent from public.reports
   where reporter_id = new.reporter_id and created_at > now() - interval '24 hours';
  if v_recent >= 10 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  new.status := 'open';
  new.reviewed_by := null;
  new.resolution_note := null;
  new.resolved_at := null;
  return new;
end $$;

create trigger reports_before_insert before insert on public.reports
  for each row execute function public.tg_reports_before_insert();
