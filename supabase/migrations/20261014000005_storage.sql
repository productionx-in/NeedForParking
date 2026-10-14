-- =============================================================================
-- 5. Storage: listing-photos bucket and policies
--
-- Object path layout:  <owner_id>/<listing_id>/<filename>.(jpg|jpeg|png|webp)
-- The bucket is public-read (photos of published listings are meant to be seen without
-- registration; object names contain unguessable UUIDs). Upload / update / delete are
-- limited to the authenticated owner of the listing named in the path. Size and MIME limits
-- are enforced by the Storage service from the bucket configuration below.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Parses and authorizes an object name without ever raising on malformed input.
create function public.can_write_listing_photo(p_object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_object_name, '/');
begin
  if auth.uid() is null or array_length(parts, 1) is distinct from 3 then return false; end if;
  if parts[1] <> auth.uid()::text then return false; end if;
  if parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if lower(parts[3]) !~ '^[a-z0-9][a-z0-9._-]{0,100}\.(jpe?g|png|webp)$' then return false; end if;
  return public.can_transact()
     and exists (select 1 from public.parking_listings l
                  where l.id = parts[2]::uuid and l.owner_id = auth.uid() and l.status <> 'removed');
end $$;
revoke execute on function public.can_write_listing_photo(text) from public, anon;
grant execute on function public.can_write_listing_photo(text) to authenticated;

create policy "listing photos: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and public.can_write_listing_photo(name));

create policy "listing photos: owner can update" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-photos' and public.can_write_listing_photo(name))
  with check (bucket_id = 'listing-photos' and public.can_write_listing_photo(name));

create policy "listing photos: owner or admin can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- Owners may list/read their own objects through the API (needed for upsert checks); public URLs need no policy.
create policy "listing photos: owner can read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
