<script lang="ts" setup>
import type { ArtworkRow } from "~~/types/supabase/tables";

definePageMeta({ layout: "artist" });

useSeoMeta({
  title: "Portfolio",
  description:
    "Explore the portfolio of original mixed media artworks by Jamie Stambolie Nelson.",
  ogTitle: "Portfolio",
  ogDescription:
    "Explore the portfolio of original mixed media artworks by Jamie Stambolie Nelson.",
});

const { data: artworks, error } = await useFetch<ArtworkRow[]>(
  "/api/artworks/artworks",
);

const portfolioArtworks = computed(
  () => artworks.value?.filter((artwork) => artwork.image_path) ?? [],
);
</script>

<template>
  <section class="artistPortfolio" aria-labelledby="portfolio-heading">
    <h1 id="portfolio-heading">Portfolio</h1>
    <p v-if="error" class="statusMessage">
      The portfolio could not be loaded. Please try again later.
    </p>
    <p v-else-if="!portfolioArtworks.length" class="statusMessage">
      New artworks are coming soon.
    </p>
    <ul v-else class="portfolioGrid">
      <li v-for="(artwork, index) in portfolioArtworks" :key="artwork.id">
        <NuxtLink class="artworkLink" :to="`/artworks/${artwork.id}`">
          <NuxtImg
            :src="artwork.image_path ?? undefined"
            :alt="artwork.title || 'Untitled artwork'"
            class="artworkImage"
            format="webp"
            quality="80"
            sizes="100vw md:45vw xl:900px"
            :loading="index < 2 ? 'eager' : 'lazy'"
            :fetchpriority="index < 2 ? 'high' : 'auto'"
          />
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.artistPortfolio {
  width: min(100% - 2rem, 120rem);
  margin: 0 auto;
  padding: 2.5rem 0 5rem;
}

.artistPortfolio h1 {
  margin: 0 0 2.5rem;
  color: var(--artist-gold);
  font-size: clamp(3rem, 3.8vw, 5rem);
  line-height: 1.1;
  font-weight: 700;
  text-align: center;
}

.statusMessage {
  margin: 0;
  text-align: center;
  font-size: clamp(1.125rem, 1.65vw, 2.125rem);
  line-height: 1.2;
}

.portfolioGrid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 2.5rem;
}

.portfolioGrid li {
  min-width: 0;
  display: flex;
  justify-content: center;
}

.artworkLink {
  display: block;
  max-width: 100%;
}

.artworkLink:focus-visible {
  outline: 2px solid var(--artist-gold);
  outline-offset: 5px;
}

.artworkImage {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
}

@media (min-width: 768px) {
  .artistPortfolio {
    width: min(81.5%, 120rem);
    padding: 3vw 0 10vw;
  }

  .artistPortfolio h1 {
    margin-bottom: 4.5vw;
  }

  .portfolioGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7vw;
    align-items: start;
  }

  .artworkImage {
    max-height: 85vh;
  }
}
</style>
