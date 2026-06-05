<script lang="ts" setup>
import type { Database } from "#types/supabase/database";
import type { CollectionDetails } from "~~/types/collections/collection";
type ArtworkRow = Database["public"]["Tables"]["artworks"]["Row"]; // look for cleaner way later

const props = defineProps<{
  artworks: ArtworkRow[];
  collection?: CollectionDetails;
}>();

const displayArtworkPopup = ref(false);
const selectedArtwork = ref<ArtworkRow | null>(null);
const imagesLoaded = ref(0);

const allImagesLoaded = computed(() => {
  return (
    props.artworks.length > 0 && props.artworks.length === imagesLoaded.value
  );
});

function loadImage() {
  imagesLoaded.value++;
}

function closePopup() {
  selectedArtwork.value = null;
  displayArtworkPopup.value = false;
}

async function viewArtwork(id: string) {
  // if (sold) return;
  await navigateTo(`/artworks/${id}`);
}
</script>

<template>
  <div class="textBlock">
    <h1>{{ props.collection?.collection_name || "All Artworks" }}</h1>
  </div>
  <div v-if="props.collection" class="colDescription">
    <p>{{ props.collection.desc }}</p>
  </div>
  <div class="artworksGrid">
    <div
      v-for="artwork in props.artworks"
      :key="artwork.id"
      @click="viewArtwork(artwork.id)"
      class="artworkContainer clickable"
    >
      <div class="imageWrapper">
        <NuxtImg
          :src="artwork?.image_path ?? undefined"
          alt=""
          class="artwork"
          format="webp"
          quality="70"
          width="80"
          height="80"
          sizes="80px"
          @load="loadImage"
          :class="{ visible: allImagesLoaded }"
        />
        <Lottie
          v-if="!allImagesLoaded"
          name="img-placeholder"
          class="artwork visible imgOverlay"
        />
      </div>
      <div class="artDetails">
        <div class="artTitle">{{ artwork?.title }}</div>
        <!-- <div v-if="!artwork?.sold" class="center">${{ artwork?.price }}</div>
        <div v-else class="center">Sold</div> -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.colDescription {
  font-size: 0.9rem;
  display: flex;
  width: 100%;
  justify-content: center;
  margin: 0 1rem 1rem 1rem;
}

.colDescription p {
  max-width: 90%;
  text-align: center;
  font-style: italic;
}

.artworkContainer {
  width: 100%;
  position: relative;
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

.imageWrapper {
  position: relative;
  width: 5rem;
  height: 5rem;
}

.artDetails {
  font-size: 0.7rem;
  line-height: 1rem;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.center {
  width: 100%;
  display: flex;
  justify-content: center;
}

.artTitle {
  width: 5rem;
  min-width: 0;
  flex-shrink: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.cutoffTxtSm {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.imgOverlay {
  position: absolute;
  width: 5rem;
  height: 5rem;
  margin: auto;
  opacity: 1;
  inset: 0;
  z-index: 10;
  background: var(--theme-off-white);
}

.artwork {
  width: 5rem;
  height: 5rem;
  border-radius: 8px;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.artwork.visible {
  opacity: 1;
}

.clickable {
  cursor: pointer;
}

@media (min-width: 768px) {
  .artworksGrid {
    width: 80%;
  }
  .colDescription p {
    max-width: 80%;
  }
}

@media (min-width: 1024px) {
  .artworksGrid {
    grid-template-columns: repeat(4, 1fr);
  }

  .artDetails {
    font-size: 0.9rem;
  }

  .artTitle {
    width: 100%;
  }

  .colDescription {
    max-width: 50%;
  }
}
</style>
