<script lang="ts" setup>
import type { ArtworkRow } from "~~/types/supabase/tables";

definePageMeta({
  layout: "default",
});

useSeoMeta({
  title: "Artwork Gallery",
  description:
    "Explore the full artwork gallery of original mixed media pieces by Jamie Nelson.",
  ogTitle: "Artwork Gallery",
  ogDescription:
    "Explore the full artwork gallery of original mixed media pieces by Jamie Nelson.",
});

const {
  data: artworks,


} = await useFetch<ArtworkRow[]>("/api/artworks/artworks");
</script>

<template>
  <div class="verticalContent fullWidth">
    <ArtworkGallery :artworks="artworks || []" />
  </div>
</template>

<style scoped>
.artworkContainer {
  padding: 0.5rem;
  background-color: var(--theme-white);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 2px 6px rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.artDetails {
  font-size: 0.9rem;
  line-height: 1rem;
}
.soldArtwork {
  opacity: 0.4;
  filter: grayscale(70%);
}

.artworksGrid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

.artwork {
  width: 5rem;
  height: 5rem;
  border-radius: 8px;
  object-fit: cover;
}

.clickable {
  cursor: pointer;
}

@media (min-width: 768px) {
  .artworksGrid {
    width: 80%;
  }
}

@media (min-width: 1024px) {
  .artworksGrid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
