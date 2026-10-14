-- =============================================================================
-- 4. RPC layer: search, disclosure-controlled reads, request lists, admin operations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- search_listings: SECURITY INVOKER, so RLS still decides what is visible.
-- Distance is computed from PUBLIC (snapped unless owner opted in) coordinates only,
-- so it can't be used to triangulate a hidden exact location.
-- ---------------------------------------------------------------------------
create function public.search_listings(
  p_query        text default null,
  p_locality     text default null,
  p_vehicle      text default null,
  p_min_price    numeric default null,
  p_max_price    numeric default null,
  p_rental_type  text default null,
  p_cover_type   text default null,
  p_day          smallint default null,
  p_open_now     boolean default false,
  p_overnight    boolean default false,
  p_access_24h   boolean default false,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_radius_km    double precision default null,
  p_sort         text default 'newest',
  p_limit        integer default 12,
  p_offset       integer default 0
) returns table (
  id uuid, title text, locality text, city text, vehicle_types text[], cover_type text, rental_type text,
  price_inr numeric, min_duration integer, deposit_inr numeric, available_days smallint[],
  available_from time, available_to time, access_24h boolean, overnight_allowed boolean,
  latitude double precision, longitude double precision, location_privacy text, is_demo boolean,
  created_at timestamptz, cover_photo_path text, is_open_now boolean, distance_km double precision,
  total_count bigint
)
language sql stable set search_path = public, pg_temp as $$
  with ist as (select (now() at time zone 'Asia/Kolkata') as ts),
  base as (
    select
      l.*,
      (select ph.storage_path from public.listing_photos ph
        where ph.listing_id = l.id order by ph.position, ph.created_at limit 1) as cover_photo_path,
      case when p_lat is not null and p_lng is not null and l.latitude is not null and l.longitude is not null then
        6371.0 * 2 * asin(least(1.0, sqrt(
          power(sin(radians(l.latitude - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(l.latitude)) * power(sin(radians(l.longitude - p_lng) / 2), 2)
        )))
      end as distance_km,
      (extract(dow from i.ts)::smallint = any (l.available_days)
        and (l.access_24h
             or (l.available_from is not null and l.available_to is not null
                 and case when l.available_from < l.available_to
                          then i.ts::time >= l.available_from and i.ts::time < l.available_to
                          else (i.ts::time >= l.available_from or i.ts::time < l.available_to) end))
      ) as is_open_now
    from public.parking_listings l
    cross join ist i
    where l.status = 'published'
      and l.moderation_status = 'ok'
      and public.owner_is_active(l.owner_id)
      and (coalesce(p_query, '') = ''
           or l.title ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or l.locality ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (coalesce(p_locality, '') = '' or lower(l.locality) = lower(p_locality))
      and (p_vehicle is null or p_vehicle = any (l.vehicle_types))
      and (p_rental_type is null or l.rental_type = p_rental_type)
      and (p_cover_type is null or l.cover_type = p_cover_type)
      and (p_min_price is null or l.price_inr >= p_min_price)
      and (p_max_price is null or l.price_inr <= p_max_price)
      and (p_day is null or p_day = any (l.available_days))
      and (not coalesce(p_overnight, false) or l.overnight_allowed)
      and (not coalesce(p_access_24h, false) or l.access_24h)
  )
  select b.id, b.title, b.locality, b.city, b.vehicle_types, b.cover_type, b.rental_type,
         b.price_inr, b.min_duration, b.deposit_inr, b.available_days,
         b.available_from, b.available_to, b.access_24h, b.overnight_allowed,
         b.latitude, b.longitude, b.location_privacy, b.is_demo,
         b.created_at, b.cover_photo_path, b.is_open_now, b.distance_km,
         count(*) over () as total_count
  from base b
  where (not coalesce(p_open_now, false) or b.is_open_now)
    and (p_radius_km is null or p_lat is null or p_lng is null or b.distance_km <= p_radius_km)
  order by
    case when p_sort = 'distance' then b.distance_km end asc nulls last,
    case when p_sort = 'price_asc' then b.price_inr end asc,
    case when p_sort = 'price_desc' then b.price_inr end desc,
    b.created_at desc, b.id
  limit greatest(1, least(coalesce(p_limit, 12), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke execute on function public.search_listings(text, text, text, numeric, numeric, text, text, smallint, boolean, boolean, boolean, double precision, double precision, double precision, text, integer, integer) from public;
grant execute on function public.search_listings(text, text, text, numeric, numeric, text, text, smallint, boolean, boolean, boolean, double precision, double precision, double precision, text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner information that is safe to disclose publicly (no phone, no email).
-- Only returned for owners that currently have a public listing.
-- ---------------------------------------------------------------------------
create function public.get_public_owner(p_owner_id uuid)
returns table (display_name text, member_since timestamptz, phone_verified boolean, published_count bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.display_name, ''), 'Member'),
         p.created_at,
         exists (select 1 from auth.users u where u.id = p.id and u.phone_confirmed_at is not null),
         (select count(*) from public.parking_listings l
           where l.owner_id = p.id and l.status = 'published' and l.moderation_status = 'ok')
  from public.profiles p
  where p.id = p_owner_id
    and p.account_status = 'active'
    and exists (select 1 from public.parking_listings l
                 where l.owner_id = p.id and l.status = 'published' and l.moderation_status = 'ok')
$$;
revoke execute on function public.get_public_owner(uuid) from public;
grant execute on function public.get_public_owner(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private access details are released only to a requester whose request was ACCEPTED
-- (and has not ended). Owners read them directly through RLS.
-- ---------------------------------------------------------------------------
create function public.get_booked_listing_access(p_request_id uuid)
returns table (address_line text, exact_latitude double precision, exact_longitude double precision, access_instructions text)
language sql stable security definer set search_path = '' as $$
  select d.address_line, d.exact_latitude, d.exact_longitude, d.access_instructions
  from public.booking_requests r
  join public.listing_private_details d on d.listing_id = r.listing_id
  where r.id = p_request_id
    and r.requester_id = auth.uid()
    and r.status = 'accepted'
    and (r.end_date is null or r.end_date >= public.ist_today())
    and public.is_account_active()
$$;
revoke execute on function public.get_booked_listing_access(uuid) from public, anon;
grant execute on function public.get_booked_listing_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Request lists for dashboards (join in only non-sensitive fields about the other party)
-- ---------------------------------------------------------------------------
create function public.list_my_requests()
returns table (
  id uuid, listing_id uuid, status text, schedule_type text, start_date date, end_date date,
  start_time time, end_time time, recurring_days smallint[], vehicle_type text, message text,
  owner_response text, responded_at timestamptz, created_at timestamptz,
  listing_title text, listing_locality text, listing_status text, listing_is_demo boolean, other_party_name text
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.listing_id, r.status, r.schedule_type, r.start_date, r.end_date, r.start_time, r.end_time,
         r.recurring_days, r.vehicle_type, r.message, r.owner_response, r.responded_at, r.created_at,
         l.title, l.locality, l.status, l.is_demo,
         coalesce(nullif(o.display_name, ''), 'Owner')
  from public.booking_requests r
  join public.parking_listings l on l.id = r.listing_id
  join public.profiles o on o.id = l.owner_id
  where r.requester_id = auth.uid()
  order by r.created_at desc
$$;
revoke execute on function public.list_my_requests() from public, anon;
grant execute on function public.list_my_requests() to authenticated;

create function public.list_incoming_requests()
returns table (
  id uuid, listing_id uuid, status text, schedule_type text, start_date date, end_date date,
  start_time time, end_time time, recurring_days smallint[], vehicle_type text, message text,
  owner_response text, responded_at timestamptz, created_at timestamptz,
  listing_title text, listing_locality text, listing_status text, listing_is_demo boolean, other_party_name text
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.listing_id, r.status, r.schedule_type, r.start_date, r.end_date, r.start_time, r.end_time,
         r.recurring_days, r.vehicle_type, r.message, r.owner_response, r.responded_at, r.created_at,
         l.title, l.locality, l.status, l.is_demo,
         coalesce(nullif(q.display_name, ''), 'Requester')
  from public.booking_requests r
  join public.parking_listings l on l.id = r.listing_id
  join public.profiles q on q.id = r.requester_id
  where l.owner_id = auth.uid()
  order by r.created_at desc
$$;
revoke execute on function public.list_incoming_requests() from public, anon;
grant execute on function public.list_incoming_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin operations. Authorization is decided HERE, from the database, using auth.uid().
-- ---------------------------------------------------------------------------
create function public.admin_set_listing_moderation(p_listing_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('ok', 'suspended') then raise exception 'invalid_status' using errcode = 'check_violation'; end if;
  update public.parking_listings
     set moderation_status = p_status, moderation_note = left(p_note, 500)
   where id = p_listing_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, note)
  values (auth.uid(), 'listing_' || p_status, 'listing', p_listing_id, left(p_note, 500));
end $$;

create function public.admin_set_account_status(p_user_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'invalid_status' using errcode = 'check_violation'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_modify_self' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = p_user_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_role = 'admin' then raise exception 'cannot_modify_admin' using errcode = '42501'; end if;
  update public.profiles
     set account_status = p_status,
         suspension_reason = case when p_status = 'suspended' then left(p_reason, 500) else null end
   where id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, note)
  values (auth.uid(), 'account_' || p_status, 'account', p_user_id, left(p_reason, 500));
end $$;

create function public.admin_resolve_report(p_report_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('actioned', 'dismissed') then raise exception 'invalid_status' using errcode = 'check_violation'; end if;
  update public.reports
     set status = p_status, reviewed_by = auth.uid(), resolution_note = left(p_note, 500), resolved_at = now()
   where id = p_report_id and status = 'open';
  if not found then raise exception 'not_found_or_closed' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, note)
  values (auth.uid(), 'report_' || p_status, 'report', p_report_id, left(p_note, 500));
end $$;

revoke execute on function public.admin_set_listing_moderation(uuid, text, text),
                           public.admin_set_account_status(uuid, text, text),
                           public.admin_resolve_report(uuid, text, text)
  from public, anon;
grant execute on function public.admin_set_listing_moderation(uuid, text, text),
                          public.admin_set_account_status(uuid, text, text),
                          public.admin_resolve_report(uuid, text, text)
  to authenticated;
