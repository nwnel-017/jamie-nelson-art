-- Run in an isolated PostgreSQL database as postgres; always rolls back.
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create function auth.role() returns text language sql stable as
$$ select current_user::text $$;
insert into auth.users values
  ('dc665c9b-2aca-48bd-a14d-270c35d160a6'),
  ('00000000-0000-0000-0000-000000000002');

-- Intentionally no pg_net/pg_graphql extensions: baseline must still succeed.
\ir ../migrations/20260815143522_remote_schema.sql
\ir ../migrations/20261028000000_add_artwork_year_medium.sql
\ir ../migrations/20261031000000_restrict_admin_access.sql

create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

insert into public.collections (id, collection_name)
values ('00000000-0000-0000-0000-000000000003', 'Test');
insert into public.artworks (id, title, collection_id)
values ('00000000-0000-0000-0000-000000000004', 'Test', '00000000-0000-0000-0000-000000000003');
insert into public.cover_images (image_path) values ('test');
insert into public.gallery_images (artwork_id, image_path, "order")
values ('00000000-0000-0000-0000-000000000004', 'test', 1);
insert into public.orders (buyer_email, address_line_1, buyer_name, shipping_cost)
values ('test@example.test', 'Test', 'Test', 0);

set local role anon;
select pg_temp.assert_true((select count(*) = 1 from public.artworks), 'public artwork read');
select pg_temp.assert_true((select count(*) = 1 from public.collections), 'public collection read');
select pg_temp.assert_true((select count(*) = 1 from public.cover_images), 'public cover read');
select pg_temp.assert_true((select count(*) = 1 from public.gallery_images), 'public gallery read');
select pg_temp.assert_true(not has_table_privilege(current_user, 'public.orders', 'select'), 'anonymous orders denied');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.assert_true(not public.is_artist_admin(), 'non-admin rejected');
select pg_temp.assert_true((select count(*) = 0 from public.orders), 'non-admin cannot read orders');
do $$ declare t text; n integer; begin
  foreach t in array array['artworks', 'collections', 'cover_images', 'gallery_images', 'orders'] loop
    execute format('update public.%I set id = id', t);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'non-admin updated %', t; end if;
    execute format('delete from public.%I', t);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'non-admin deleted %', t; end if;
    if has_table_privilege(current_user, 'public.' || t, 'truncate') then
      raise exception 'non-admin can truncate %', t;
    end if;
    if t <> 'orders' then
      begin
        execute format('insert into public.%I select * from public.%I limit 1', t, t);
        raise exception 'non-admin insert allowed on %', t;
      exception when insufficient_privilege then null; end;
    end if;
  end loop;
  begin
    insert into private.artist_admins (user_id) values (auth.uid());
    raise exception 'self-enrollment allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dc665c9b-2aca-48bd-a14d-270c35d160a6', true);
set local role authenticated;
select pg_temp.assert_true(public.is_artist_admin(), 'verified admin recognized');
select pg_temp.assert_true((select count(*) = 1 from public.orders), 'admin orders readable');
insert into public.collections (id, collection_name)
values ('00000000-0000-0000-0000-000000000005', 'Admin collection');
insert into public.artworks (id, title, collection_id)
values ('00000000-0000-0000-0000-000000000006', 'Admin artwork', '00000000-0000-0000-0000-000000000005');
insert into public.gallery_images (artwork_id, image_path, "order")
values ('00000000-0000-0000-0000-000000000006', 'admin image', 1);
insert into public.cover_images (image_path) values ('admin insert');
do $$ declare t text; n integer; begin
  foreach t in array array['artworks', 'collections', 'cover_images', 'gallery_images', 'orders'] loop
    execute format('update public.%I set id = id', t);
    get diagnostics n = row_count;
    if n < 1 then raise exception 'admin cannot update %', t; end if;
  end loop;
end $$;
do $$ declare t text; n integer; begin
  -- Delete dependents first to respect the real baseline foreign keys.
  foreach t in array array['gallery_images', 'artworks', 'collections', 'cover_images', 'orders'] loop
    execute format('delete from public.%I', t);
    get diagnostics n = row_count;
    if n < 1 then raise exception 'admin cannot delete %', t; end if;
  end loop;
end $$;
reset role;

set local role service_role;
insert into public.orders (buyer_email, address_line_1, buyer_name, shipping_cost)
values ('service@example.test', 'Test', 'Test', 0);
select pg_temp.assert_true((select count(*) = 1 from public.orders), 'service role access');
reset role;

-- Removing the account from the allowlist revokes admin access immediately.
delete from private.artist_admins;
set local role authenticated;
select pg_temp.assert_true(not public.is_artist_admin(), 'empty allowlist denies access');
select pg_temp.assert_true((select count(*) = 0 from public.orders), 'revoked admin cannot read orders');
reset role;
rollback;
