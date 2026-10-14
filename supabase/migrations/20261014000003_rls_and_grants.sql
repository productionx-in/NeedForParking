-- =============================================================================
-- 3. Row Level Security + explicit grants for every exposed table
--
-- Principle: deny by default. Every table has RLS enabled; privileges are revoked and then
-- granted explicitly, per column where it matters (so a client can never write role,
-- moderation fields, computed public coordinates, or another user's id).
-- Works whether or not the project auto-grants privileges to new public tables.
-- =============================================================================

alter table public.profiles                enable row level security;
alter table public.parking_listings        enable row level security;
alter table public.listing_private_details enable row level security;
alter table public.listing_photos          enable row level security;
alter table public.booking_requests        enable row level security;
alter table public.favorites               enable row level security;
alter table public.reports                 enable row level security;
alter table public.admin_audit_log         enable row level security;

revoke all on public.profiles, public.parking_listings, public.listing_private_details, public.listing_photos,
              public.booking_requests, public.favorites, public.reports, public.admin_audit_log
  from public, anon, authenticated;

-- Helper functions used inside policies must be callable by the roles evaluating them.
revoke execute on function public.is_admin(), public.is_account_active(), public.can_transact(),
                           public.owns_listing(uuid), public.owner_is_active(uuid), public.is_listing_public(uuid)
  from public;
grant execute on function public.is_admin(), public.is_account_active(), public.can_transact(),
                          public.owns_listing(uuid), public.owner_is_active(uuid), public.is_listing_public(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles: own row (or admin) only. Role/status can't be changed by clients.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, email) on public.profiles to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.is_account_active())
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- parking_listings: public can read ONLY published, unsuspended listings of active owners.
-- ---------------------------------------------------------------------------
grant select on public.parking_listings to anon, authenticated;
grant insert (owner_id, status, title, description, vehicle_types, cover_type, public_landmark, locality, city,
              postal_code, location_privacy, show_address_publicly, rental_type, price_inr, min_duration,
              deposit_inr, available_days, available_from, available_to, access_24h, overnight_allowed,
              max_height_m, max_length_m, vehicle_restrictions, security_features, owner_declaration,
              permission_status, permission_notes)
  on public.parking_listings to authenticated;
grant update (status, title, description, vehicle_types, cover_type, public_landmark, locality, city,
              postal_code, location_privacy, show_address_publicly, rental_type, price_inr, min_duration,
              deposit_inr, available_days, available_from, available_to, access_24h, overnight_allowed,
              max_height_m, max_length_m, vehicle_restrictions, security_features, owner_declaration,
              permission_status, permission_notes)
  on public.parking_listings to authenticated;

create policy listings_select_public on public.parking_listings
  for select to anon, authenticated
  using (status = 'published' and moderation_status = 'ok' and public.owner_is_active(owner_id));

create policy listings_select_owner on public.parking_listings
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy listings_select_admin on public.parking_listings
  for select to authenticated
  using (public.is_admin());

create policy listings_insert_own on public.parking_listings
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft' and public.can_transact());

create policy listings_update_own on public.parking_listings
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.is_account_active())
  with check (owner_id = (select auth.uid()));

-- No DELETE grant: "deleting" a listing sets status = 'removed' (soft delete keeps request history).

-- ---------------------------------------------------------------------------
-- listing_private_details: owner only. Accepted requesters get it via RPC.
-- ---------------------------------------------------------------------------
grant select on public.listing_private_details to authenticated;
grant insert (listing_id, address_line, exact_latitude, exact_longitude, access_instructions)
  on public.listing_private_details to authenticated;
grant update (address_line, exact_latitude, exact_longitude, access_instructions)
  on public.listing_private_details to authenticated;

create policy private_details_select_owner on public.listing_private_details
  for select to authenticated using (public.owns_listing(listing_id));

create policy private_details_insert_owner on public.listing_private_details
  for insert to authenticated
  with check (public.owns_listing(listing_id) and public.can_transact());

create policy private_details_update_owner on public.listing_private_details
  for update to authenticated
  using (public.owns_listing(listing_id) and public.is_account_active())
  with check (public.owns_listing(listing_id));

-- ---------------------------------------------------------------------------
-- listing_photos
-- ---------------------------------------------------------------------------
grant select on public.listing_photos to anon, authenticated;
grant insert (listing_id, storage_path, position) on public.listing_photos to authenticated;
grant update (position) on public.listing_photos to authenticated;
grant delete on public.listing_photos to authenticated;

create policy photos_select_public_or_owner on public.listing_photos
  for select to anon, authenticated
  using (public.is_listing_public(listing_id) or public.owns_listing(listing_id) or public.is_admin());

create policy photos_insert_owner on public.listing_photos
  for insert to authenticated
  with check (public.owns_listing(listing_id) and public.can_transact());

create policy photos_update_owner on public.listing_photos
  for update to authenticated
  using (public.owns_listing(listing_id) and public.is_account_active())
  with check (public.owns_listing(listing_id));

create policy photos_delete_owner_or_admin on public.listing_photos
  for delete to authenticated
  using ((public.owns_listing(listing_id) and public.is_account_active()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- booking_requests: visible only to the requester and the listing owner.
-- ---------------------------------------------------------------------------
grant select on public.booking_requests to authenticated;
grant insert (listing_id, requester_id, status, schedule_type, start_date, end_date, start_time, end_time,
              recurring_days, vehicle_type, message)
  on public.booking_requests to authenticated;
grant update (status, owner_response) on public.booking_requests to authenticated;

create policy requests_select_parties on public.booking_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or public.owns_listing(listing_id));

create policy requests_insert_own on public.booking_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and public.can_transact()
    and not public.owns_listing(listing_id)
  );

create policy requests_update_parties on public.booking_requests
  for update to authenticated
  using ((requester_id = (select auth.uid()) or public.owns_listing(listing_id)) and public.is_account_active())
  with check (requester_id = (select auth.uid()) or public.owns_listing(listing_id));

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.favorites to authenticated;

create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_account_active() and public.is_listing_public(listing_id));
create policy favorites_delete_own on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
grant select on public.reports to authenticated;
grant insert (listing_id, reporter_id, reason, details) on public.reports to authenticated;

create policy reports_select_own_or_admin on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and public.can_transact()
    and public.is_listing_public(listing_id)
  );
-- Resolving a report happens only through admin_resolve_report().

-- ---------------------------------------------------------------------------
-- admin_audit_log: readable by admins; written only by admin RPCs.
-- ---------------------------------------------------------------------------
grant select on public.admin_audit_log to authenticated;
create policy audit_select_admin on public.admin_audit_log
  for select to authenticated using (public.is_admin());

-- Admins may read profiles / listings / photos (see policies above) but NOT booking requests or private details.
