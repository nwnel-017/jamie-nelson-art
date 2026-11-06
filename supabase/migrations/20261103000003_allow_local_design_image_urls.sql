-- Local Supabase serves stored images over loopback HTTP during development.
alter table public.design_requests drop constraint design_requests_design_image_check;
alter table public.design_requests add constraint design_requests_design_image_check
check (
  design_image ~ '^https://'
  or design_image ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/storage/v1/object/public/website_designs/'
);
