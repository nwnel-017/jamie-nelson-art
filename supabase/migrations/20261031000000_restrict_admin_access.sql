-- Keep authorization data outside the schemas exposed by the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.artist_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.artist_admins enable row level security;
revoke all on private.artist_admins from public, anon, authenticated;

-- Verified against the account identified by this application's ADMIN_EMAIL.
-- Do not infer admin rights from user-editable metadata or all existing users.
-- Fresh installations without this account intentionally start with no admins.
insert into private.artist_admins (user_id)
select id from auth.users
where id = 'dc665c9b-2aca-48bd-a14d-270c35d160a6'::uuid;

create function public.is_artist_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.artist_admins
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_artist_admin() from public, anon, authenticated;
grant execute on function public.is_artist_admin() to authenticated;

-- Permissive policies are ORed together: remove every previous policy on the
-- affected tables so an old "any authenticated user" policy cannot bypass this.
do $$
declare
  existing_policy record;
  table_name text;
begin
  for existing_policy in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('artworks', 'collections', 'cover_images', 'gallery_images', 'orders')
  loop
    execute format('drop policy %I on public.%I', existing_policy.policyname, existing_policy.tablename);
  end loop;

  foreach table_name in array array['artworks', 'collections', 'cover_images', 'gallery_images', 'orders']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    -- RLS does not protect TRUNCATE, REFERENCES or TRIGGER privileges.
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('grant select, update, delete on public.%I to authenticated', table_name);

    if table_name <> 'orders' then
      execute format('grant select on public.%I to anon', table_name);
      execute format('grant insert on public.%I to authenticated', table_name);
      execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', table_name);
      execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_artist_admin()))', table_name);
    else
      -- Order creation remains restricted to trusted server/service-role code.
      execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_artist_admin()))', table_name);
    end if;

    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_artist_admin())) with check ((select public.is_artist_admin()))', table_name);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_artist_admin()))', table_name);
  end loop;
end;
$$;

-- The identity-backed cover image ID needs sequence access for admin inserts.
grant usage on sequence public.cover_images_id_seq to authenticated;
