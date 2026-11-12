<script lang="ts" setup>
import type { CoverImageRow } from "~~/types/supabase/tables";

definePageMeta({
  layout: "default",
});

useSeoMeta({
  title: "Original Artwork Portfolio",
  description:
    "Discover original mixed media artwork by Jamie Nelson, explore featured pieces, and browse a visual-first artist portfolio.",
  ogTitle: "Jamie Nelson Art",
  ogDescription:
    "Discover original mixed media artwork by Jamie Nelson, explore featured pieces, and browse a visual-first artist portfolio.",
});

const {
  data: artworks,
  pending,
  error,
} = await useFetch<CoverImageRow[]>("/api/artworks/coverImages/coverImages");
</script>

<template>
  <div class="verticalContent fillPage">
    <div class="landingPad">
      <div v-if="pending">Loading...</div>
      <div v-else-if="error">Failed to load content</div>
      <ImgCarousal v-else :artworks="artworks" />
    </div>
  </div>
</template>

<style scoped>
.landingPad {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  align-items: center;
}

.lndPadImgContainer {
  width: 100%;
  height: 10rem;
  overflow: hidden;
}

.landingPad h1 {
  margin: 0;
}

.imageContainer {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.artworkLg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.landingText {
  text-align: center;
  width: 90%;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .lndPadImgContainer {
    height: 20rem;
  }

  p {
    text-align: left;
  }
}

@media (min-width: 1024px) {
  .lndPadImgContainer {
    height: 100vh;
  }
}
</style>
