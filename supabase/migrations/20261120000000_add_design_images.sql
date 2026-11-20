-- Store validated image answers for design clarification and public website use.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design_images', 'design_images', true, 5242880, array['image/png','image/jpeg','image/webp']);

create policy design_images_block_client_insert on storage.objects
as restrictive for insert to anon, authenticated
with check (bucket_id <> 'design_images');
create policy design_images_block_client_update on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id <> 'design_images') with check (bucket_id <> 'design_images');
create policy design_images_block_client_delete on storage.objects
as restrictive for delete to anon, authenticated
using (bucket_id <> 'design_images');

create table public.design_images (
  id uuid primary key,
  design_request_id uuid not null references public.design_requests(id) on delete cascade,
  question_id uuid not null,
  filename text not null check (length(filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  created_at timestamptz not null default now()
);
alter table public.design_images enable row level security;
revoke all on public.design_images from anon, authenticated;
grant all on public.design_images to service_role;
create index design_images_request_idx on public.design_images(design_request_id);
notify pgrst, 'reload schema';
