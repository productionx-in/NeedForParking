-- =============================================================================
-- 1. Schema: tables, constraints, indexes
-- Parking Research Prototype (Hyderabad). Prototype-grade, not production-certified.
--
-- Design notes
--  * Public vs private data are split into two tables:
--      parking_listings          -> only fields intended for public disclosure
--      listing_private_details   -> exact address, exact coordinates, access instructions
--    Public coordinates are COMPUTED by a trigger (never written by clients): they are
--    snapped to a ~400 m grid unless the owner explicitly opts in to exact location.
--  * Phone numbers are never copied out of auth.users. profiles holds no phone number.
--  * Roles/moderation flags are protected by column-level grants AND guard triggers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text not null default '' check (char_length(display_name) <= 60),
  email             text check (email is null or (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  role              text not null default 'user' check (role in ('user', 'admin')),
  account_status    text not null default 'active' check (account_status in ('active', 'suspended')),
  suspension_reason text check (suspension_reason is null or char_length(suspension_reason) <= 500),
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. Contains NO phone number. role/account_status are server-controlled.';

-- ---------------------------------------------------------------------------
-- parking_listings (public-safe columns only)
-- ---------------------------------------------------------------------------
create table public.parking_listings (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  status             text not null default 'draft' check (status in ('draft', 'published', 'paused', 'removed')),
  moderation_status  text not null default 'ok' check (moderation_status in ('ok', 'suspended')),
  moderation_note    text check (moderation_note is null or char_length(moderation_note) <= 500),

  title              text not null default '' check (char_length(title) <= 120),
  description        text not null default '' check (char_length(description) <= 2000),
  vehicle_types      text[] not null default '{}' check (vehicle_types <@ array['car', 'motorcycle', 'other']::text[]),
  cover_type         text check (cover_type in ('covered', 'open')),

  -- Public location. latitude/longitude/public_address are written ONLY by a trigger.
  public_landmark    text check (public_landmark is null or char_length(public_landmark) <= 100),
  locality           text check (locality is null or char_length(locality) between 2 and 80),
  city               text not null default 'Hyderabad' check (city in ('Hyderabad', 'Secunderabad')),
  state              text not null default 'Telangana' check (state = 'Telangana'),
  postal_code        text check (postal_code is null or postal_code ~ '^[1-9][0-9]{5}$'),
  location_privacy   text not null default 'approximate' check (location_privacy in ('approximate', 'exact')),
  show_address_publicly boolean not null default false,
  latitude           double precision check (latitude is null or latitude between 16.9 and 17.9),
  longitude          double precision check (longitude is null or longitude between 78.0 and 79.0),
  public_address     text,

  rental_type        text check (rental_type in ('hourly', 'daily', 'monthly')),
  price_inr          numeric(10, 2) check (price_inr is null or (price_inr > 0 and price_inr <= 1000000)),
  currency           text not null default 'INR' check (currency = 'INR'),
  min_duration       integer check (min_duration is null or min_duration between 1 and 365),
  deposit_inr        numeric(10, 2) not null default 0 check (deposit_inr >= 0 and deposit_inr <= 1000000),

  available_days     smallint[] not null default '{}' check (available_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  available_from     time,
  available_to       time,
  access_24h         boolean not null default false,
  overnight_allowed  boolean not null default false,

  max_height_m       numeric(3, 2) check (max_height_m is null or max_height_m > 0),
  max_length_m       numeric(4, 2) check (max_length_m is null or max_length_m > 0),
  vehicle_restrictions text check (vehicle_restrictions is null or char_length(vehicle_restrictions) <= 500),
  security_features  text[] not null default '{}' check (security_features <@ array['cctv', 'security_guard', 'gated', 'well_lit', 'intercom', 'ev_charging']::text[]),

  owner_declaration  boolean not null default false,
  permission_status  text not null default 'unconfirmed' check (permission_status in ('unconfirmed', 'not_required', 'obtained')),
  permission_notes   text check (permission_notes is null or char_length(permission_notes) <= 500),

  is_demo            boolean not null default false,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A window may cross midnight (e.g. 20:00-07:00) but must not be empty.
  constraint listing_time_window check (available_from is null or available_to is null or available_from <> available_to)
);
comment on table public.parking_listings is 'Public-safe listing fields only. Exact address/coordinates live in listing_private_details.';

-- ---------------------------------------------------------------------------
-- listing_private_details (owner-only; shared with accepted requesters via RPC)
-- ---------------------------------------------------------------------------
create table public.listing_private_details (
  listing_id          uuid primary key references public.parking_listings (id) on delete cascade,
  address_line        text check (address_line is null or char_length(address_line) between 5 and 200),
  exact_latitude      double precision check (exact_latitude is null or exact_latitude between 16.9 and 17.9),
  exact_longitude     double precision check (exact_longitude is null or exact_longitude between 78.0 and 79.0),
  access_instructions text check (access_instructions is null or char_length(access_instructions) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- listing_photos
-- ---------------------------------------------------------------------------
create table public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.parking_listings (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  position     smallint not null default 0 check (position between 0 and 20),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- booking_requests (inquiries only, no payments)
-- ---------------------------------------------------------------------------
create table public.booking_requests (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.parking_listings (id) on delete cascade,
  requester_id    uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  schedule_type   text not null check (schedule_type in ('one_time', 'recurring')),
  start_date      date not null,
  end_date        date,
  start_time      time,
  end_time        time,
  recurring_days  smallint[],
  vehicle_type    text not null check (vehicle_type in ('car', 'motorcycle', 'other')),
  message         text not null default '' check (char_length(message) <= 1000),
  owner_response  text check (owner_response is null or char_length(owner_response) <= 500),
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint request_date_range check (end_date is null or end_date >= start_date),
  constraint request_max_span check (end_date is null or end_date - start_date <= 366),
  constraint request_one_time_needs_end check (schedule_type <> 'one_time' or end_date is not null),
  constraint request_recurring_days check (
    (schedule_type = 'recurring'
       and recurring_days is not null
       and cardinality(recurring_days) between 1 and 7
       and recurring_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
    or (schedule_type = 'one_time' and recurring_days is null)
  ),
  constraint request_time_window check (
    (start_time is null) = (end_time is null) and (start_time is null or start_time < end_time)
  )
);

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.parking_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------------------------------------------------------------------------
-- reports (abuse / accuracy reports on listings)
-- ---------------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.parking_listings (id) on delete cascade,
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  reason          text not null check (reason in ('inaccurate', 'scam', 'unsafe', 'not_authorized', 'abusive', 'other')),
  details         text not null default '' check (char_length(details) <= 1000),
  status          text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  reviewed_by     uuid references public.profiles (id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- admin_audit_log (written only by admin RPCs)
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   uuid not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index parking_listings_owner_idx        on public.parking_listings (owner_id);
create index parking_listings_public_idx       on public.parking_listings (status, moderation_status, locality);
create index parking_listings_price_idx        on public.parking_listings (rental_type, price_inr) where status = 'published';
create index parking_listings_vehicle_gin_idx  on public.parking_listings using gin (vehicle_types);
create index parking_listings_geo_idx          on public.parking_listings (latitude, longitude) where status = 'published';
create index parking_listings_created_idx      on public.parking_listings (created_at desc);
create index listing_photos_listing_idx        on public.listing_photos (listing_id, position);
create index booking_requests_listing_idx      on public.booking_requests (listing_id, status);
create index booking_requests_requester_idx    on public.booking_requests (requester_id, created_at desc);
create index booking_requests_dates_idx        on public.booking_requests (listing_id, start_date);
create index favorites_listing_idx             on public.favorites (listing_id);
create index reports_status_idx                on public.reports (status, created_at desc);
create index reports_listing_idx               on public.reports (listing_id);
create index reports_reporter_idx              on public.reports (reporter_id, created_at desc);
create unique index reports_one_open_per_reporter_listing on public.reports (listing_id, reporter_id) where status = 'open';
create index admin_audit_log_created_idx       on public.admin_audit_log (created_at desc);
