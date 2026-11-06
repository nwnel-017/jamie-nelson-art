insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website_designs', 'website_designs', true, 5242880, array['image/png']);

-- Public URLs allow reading images; client writes stay blocked even if another
-- permissive policy grants broader access to storage.objects.
create policy website_designs_block_client_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id <> 'website_designs');

create policy website_designs_block_client_update on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id <> 'website_designs')
with check (bucket_id <> 'website_designs');

create policy website_designs_block_client_delete on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id <> 'website_designs');
