-- =============================================================================
-- 7. Walking-distance search
-- Parkers look for a space within ~100-300 m of where they are going, not kilometres.
--  * Public "approximate" coordinates are now snapped to a ~220 m grid (was ~430 m) so that
--    distance filtering at a 200 m radius is meaningful while the exact unit stays hidden.
--  * search_listings now takes p_radius_m and returns distance_m (metres).
--  * Approximate listings match with ~110 m of tolerance (half a grid cell), because their
--    public pin is rounded; exact-pin listings match on the true distance.
-- =============================================================================
create or replace function public.snap_coordinate(v double precision, step double precision default 0.002)
returns double precision language sql immutable set search_path = '' as $$
  select round(((floor(v / step) + 0.5) * step)::numeric, 6)::double precision
$$;

-- Re-derive public coordinates for any existing listing with the finer grid.
update public.parking_listings l
   set location_privacy = l.location_privacy
 where exists (select 1 from public.listing_private_details d where d.listing_id = l.id);

drop function if exists public.search_listings(text, text, text, numeric, numeric, text, text, smallint, boolean, boolean, boolean, double precision, double precision, double precision, text, integer, integer);

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
  p_radius_m     double precision default null,
  p_sort         text default 'newest',
  p_limit        integer default 12,
  p_offset       integer default 0
) returns table (
  id uuid, title text, locality text, city text, vehicle_types text[], cover_type text, rental_type text,
  price_inr numeric, min_duration integer, deposit_inr numeric, available_days smallint[],
  available_from time, available_to time, access_24h boolean, overnight_allowed boolean,
  latitude double precision, longitude double precision, location_privacy text, is_demo boolean,
  created_at timestamptz, cover_photo_path text, is_open_now boolean, distance_m double precision,
  total_count bigint
)
language sql stable set search_path = public, pg_temp as $$
  with ist as (select (now() at time zone 'Asia/Kolkata') as ts),
  base as (
    select
      l.*,
      (select ph.storage_path from public.listing_photos ph
        where ph.listing_id = l.id order by ph.position, ph.created_at limit 1) as cover_photo_path,
      -- Distance is measured to the PUBLIC point only, so it can't be used to triangulate a hidden exact location.
      case when p_lat is not null and p_lng is not null and l.latitude is not null and l.longitude is not null then
        6371000.0 * 2 * asin(least(1.0, sqrt(
          power(sin(radians(l.latitude - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(l.latitude)) * power(sin(radians(l.longitude - p_lng) / 2), 2)
        )))
      end as distance_m,
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
         b.created_at, b.cover_photo_path, b.is_open_now, b.distance_m,
         count(*) over () as total_count
  from base b
  where (not coalesce(p_open_now, false) or b.is_open_now)
    and (p_radius_m is null or p_lat is null or p_lng is null
         or b.distance_m <= p_radius_m + case when b.location_privacy = 'approximate' then 110 else 0 end)
  order by
    case when p_sort = 'distance' then b.distance_m end asc nulls last,
    case when p_sort = 'price_asc' then b.price_inr end asc,
    case when p_sort = 'price_desc' then b.price_inr end desc,
    b.created_at desc, b.id
  limit greatest(1, least(coalesce(p_limit, 12), 100))
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke execute on function public.search_listings(text, text, text, numeric, numeric, text, text, smallint, boolean, boolean, boolean, double precision, double precision, double precision, text, integer, integer) from public;
grant execute on function public.search_listings(text, text, text, numeric, numeric, text, text, smallint, boolean, boolean, boolean, double precision, double precision, double precision, text, integer, integer) to anon, authenticated;
