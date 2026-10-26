create table public.artist_profile (
  id boolean primary key default true check (id),
  bio text not null,
  profile_image_path text,
  updated_at timestamptz not null default now()
);

alter table public.artist_profile enable row level security;

insert into public.artist_profile (id, bio)
values (
  true,
  E'Hello, my name is Jamie Nelson.\n\nI am a 26-year-old artist from Zimbabwe, currently based in Puerto Rico. I grew up in Zimbabwe surrounded by diversity—of people, languages, patterns, and color. That environment deeply shaped the way I see and make art. Living in Mexico, Chile, the United States, and now Puerto Rico has further expanded my fascination with culture and the visual languages that emerge from everyday life. I was raised seeing Zimbabwean artists create powerful work despite economic limitations, often using recycled materials and found objects.\n\nInspired by this resourcefulness, I began collecting old magazines instead of buying expensive paints, creating collages through layering and texture. This approach sparked my ongoing interest in mixed media. I often continue this practice by working on reclaimed canvases, painting over existing surfaces as a way of extending their life and engaging with ideas of layering, memory, and renewal. Alongside figurative work, I am inspired by flowers and nature, drawn to organic colours, textures, and patterns that feel limitless. Plant life has become a way for me to explore ideas of home, memory, and hope—both personal and cultural.\n\nMy artistic practice is also shaped by my Christian faith. Rather than something I seek to explain or instruct through my work, it quietly informs the way I see the world: as something marked by brokenness, yet filled with beauty, meaning, and hope. I am inspired by the belief that people and nature carry inherent worth, and that one day all things will be restored.\n\nAlthough I have lived in different parts of the world, my work continues to draw from Zimbabwe—especially the people who carry joy, strength, and dignity through struggle. Themes of beauty, resilience, joy, and hope run throughout my practice, whether through human figures or plants. Thank you for taking the time to view my work and support my creative journey.\n\n— Jamie'
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile_images',
  'profile_images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
