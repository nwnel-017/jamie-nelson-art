<script setup lang="ts">
import type { ArtworkRow } from "#types/supabase/tables";
import type { Artwork } from "~~/types/artworks/artworks";
import type { CoverImageRow } from "#types/supabase/tables";

const props = defineProps<{
  artworks?: CoverImageRow[];
}>();

const reversed = computed<CoverImageRow[]>(() => {
  if (props.artworks && props.artworks.length > 0) {
    return [...props.artworks].reverse();
  } else {
    return [];
  }
});
</script>

<template>
  <div v-if="props.artworks" class="heroCarousel">
    <div class="carouselStrip row1">
      <div
        v-for="artwork in [...props.artworks, ...props.artworks]"
        :key="artwork.id + 'a'"
        class="imgSquare border"
      >
        <NuxtImg
          :src="artwork.image_path"
          alt="Artwork Image"
          class="carouselImg"
          format="webp"
          quality="65"
          sizes="(max-width: 768px) 40vw, (max-width: 1024px) 30vw, 15vw"
        />
      </div>
    </div>
    <div class="landingText">
      <span>W</span><span>E</span><span>L</span><span>C</span><span>O</span
      ><span>M</span><span>E</span>
    </div>
    <div class="carouselStrip row2">
      <div
        v-for="artwork in [...reversed, ...reversed]"
        :key="artwork.id"
        class="imgSquare border"
      >
        <NuxtImg
          :src="artwork.image_path"
          alt="Artwork Image"
          class="carouselImg"
          format="webp"
          quality="65"
          sizes="(max-width: 768px) 40vw, (max-width: 1024px) 30vw, 15vw"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.landingText {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: space-evenly;
  width: 80%;
}

.landingText span {
  font-size: 2rem;
  font-weight: bold;
}

.heroCarousel {
  position: relative;
  overflow: hidden;
  height: 85dvh;
  width: 100dvw;
}

.row1 {
  top: 3dvh;
  animation: scrollLeft 45s linear infinite;
}

.row2 {
  bottom: 3dvh;
  animation: scrollRight 45s linear infinite;
}

.carouselStrip {
  position: absolute;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
}

.imgSquare {
  aspect-ratio: 1 / 1;
  flex: 0 0 auto;
  width: 40vw;
  height: 100%;
}

.carouselImg {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

@media (min-width: 768px) {
  .imgSquare {
    width: 30vh;
  }
}

@media (min-width: 1024px) {
  .carouselStrip {
    gap: 2rem;
  }

  .imgSquare {
    width: 15vw;
  }

  .landingText {
    width: 50%;
  }

  .heroCarousel {
    height: 90dvh;
  }

  .landingText span {
    font-size: 2rem;
  }
}

@keyframes scrollLeft {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

@keyframes scrollRight {
  0% {
    transform: translateX(-50%);
  }
  100% {
    transform: translateX(0);
  }
}
</style>
