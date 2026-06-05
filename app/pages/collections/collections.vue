<script lang="ts" setup>
import { useCollections } from "#imports";
import type { CollectionCard } from "#types/collections/collection";

definePageMeta({
  layout: "default",
});

useSeoMeta({
  title: "Collections",
  description:
    "Browse Jamie Nelson's artwork collections and explore bodies of work organized by theme and series.",
  ogTitle: "Artwork Collections",
  ogDescription:
    "Browse Jamie Nelson's artwork collections and explore bodies of work organized by theme and series.",
});

const { getCollections } = useCollections();

const { data: collections, pending, error } = await getCollections();

const imagesLoaded = ref(0);

const collectionWithImages = computed<CollectionCard[]>(() => {
  return collections.value?.filter((collection) => collection.image_path) ?? [];
});

const allImagesLoaded = computed(() => {
  return (
    imagesLoaded.value > 0 &&
    imagesLoaded.value === collectionWithImages.value?.length
  );
});

function loadImage() {
  imagesLoaded.value++;
}

async function viewCollection(collectionId: string) {
  console.log(collectionId);
  if (collectionId) {
    await navigateTo(`/collections/${collectionId}`);
  }
}
</script>

<template>
  <div class="verticalContent fullHeight">
    <div class="textBlock">
      <h1>Collections</h1>
    </div>
    <div v-if="pending"><h1>Loading...</h1></div>
    <div v-else-if="error"><h1>No Collections to Show</h1></div>
    <div v-else-if="collections" class="collectionsGrid">
      <div
        v-for="collection in collections"
        :key="collection.id"
        @click="viewCollection(collection.id)"
        class="collectionContainer clickable"
      >
        <div class="collectionImgWrapper">
          <NuxtImg
            :src="collection?.image_path ?? undefined"
            alt=""
            class="collectionImg"
            format="webp"
            quality="70"
            sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 20vw"
            :class="{ visible: allImagesLoaded }"
            @load="loadImage"
          />
          <Lottie
            v-if="!allImagesLoaded"
            name="img-placeholder"
            class="imgOverlay"
          />
        </div>
        <div class="collectionDetails">
          <div>{{ collection?.collection_name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collectionImgWrapper {
  position: relative;
  width: 100%;
  height: 100%;
  /* min-width: 100%;
  min-height: 100%; */
  /* aspect-ratio: 16 / 9; */
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.imgOverlay {
  position: absolute;
  background: var(--theme-off-white);
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  opacity: 1;
}
</style>
