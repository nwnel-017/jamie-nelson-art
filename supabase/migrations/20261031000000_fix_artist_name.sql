update public.artist_profile
set bio = replace(
  bio,
  'Hello, my name is Jamie Nelson.',
  'Hello, my name is Jamie Stambolie Nelson.'
),
updated_at = now()
where id = true
  and position('Hello, my name is Jamie Nelson.' in bio) > 0;
