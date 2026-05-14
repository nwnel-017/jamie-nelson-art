<script lang="ts" setup>
import type { Database } from "#types/supabase/database";
import type { ArtworkRow } from "~~/types/supabase/tables";
import type { GalleryRow } from "~~/types/supabase/tables";
import VueEasyLightbox from "vue-easy-lightbox";

const route = useRoute();
const id = computed(() => route.params.id as string);

const { getGalleryImages } = useGallery();
const { startLoading, stopLoading } = useLoading();

const {
  data: artwork,
  pending: pendingArtwork,
  error,
} = await useFetch<ArtworkRow>(`/api/artworks/${id.value}`);

useSeoMeta({
  title: () => artwork.value?.title || "Artwork",
  description: () =>
    artwork.value?.description ||
    "View artwork details, pricing, and availability for this original piece by Jamie Nelson.",
  ogTitle: () => artwork.value?.title || "Artwork",
  ogDescription: () =>
    artwork.value?.description ||
    "View artwork details, pricing, and availability for this original piece by Jamie Nelson.",
  ogImage: () => artwork.value?.image_path || undefined,
});

const { data: galleryImages, pending: pendingGallery } = await useAsyncData<
  GalleryRow[]
>(`gallery-${route.params.id}`, () => getGalleryImages(id.value as string));

const currentIndex = ref(0);
const loading = computed(() => pendingArtwork.value || pendingGallery.value);

watch(loading, (val) => {
  if (val) {
    startLoading();
  } else {
    stopLoading();
  }
});

const currentImage = computed<GalleryRow | null>(() => {
  if (!galleryImages.value) return null;
  return galleryImages.value[currentIndex.value] ?? null;
});

const viewerImage = computed<string[]>(() => {
  const path = currentImage.value?.image_path;
  return path ? [path] : [];
});
const nextImage = () => {
  const images = galleryImages.value;
  if (!images?.length || images?.length < 2) return;

  currentIndex.value = (currentIndex.value + 1) % images.length;
  if (imageLoaded.value) {
    imageLoaded.value = false;
  }
};

const prevImage = () => {
  const images = galleryImages.value;
  if (!images?.length || images?.length < 2) return;

  currentIndex.value = (currentIndex.value - 1 + images.length) % images.length;
  if (imageLoaded.value) {
    imageLoaded.value = false;
  }
};

const imageLoaded = ref(false);

function loadImage() {
  imageLoaded.value = true;
}

const lightboxVisible = ref(false);

const viewLightBox = () => {
  lightboxVisible.value = true;
};

const closeLightBox = () => {
  lightboxVisible.value = false;
};

async function confirmPayment() {
  await navigateTo(`/payments/confirm/${id.value}`);
}

async function payWithStripe() {
  try {
    const { url } = await $fetch<{ url: string }>(
      "/api/stripe/create-checkout-session",
      {
        method: "POST",
        body: {
          artworkId: id.value,
          artworkName: artwork.value?.title,
        },
      },
    );

    if (url) {
      window.location.href = url;
    }
  } catch (err) {
    console.log(
      "There was an error retrieving Stripe checkout session: " + err,
    );
    throw new Error("Failed to retrieve stripe checkout session");
  }
}
</script>

<template>
  <div>
    <div v-if="artwork" class="verticalContent">
      <ClientOnly>
        <VueEasyLightbox
          :visible="lightboxVisible"
          @hide="closeLightBox"
          :imgs="viewerImage"
      /></ClientOnly>
      <div class="imgContainer">
        <ArrowButton direction="left" @click="prevImage" />
        <NuxtImg
          :src="currentImage?.image_path ?? undefined"
          alt=""
          class="imgLarge clickable"
          :class="{ visible: imageLoaded }"
          @load="loadImage"
          @click="viewLightBox"
        />
        <Lottie v-if="!imageLoaded" name="img-placeholder" class="imgOverlay" />
        <ArrowButton @click="nextImage" />
      </div>
      <div class="clmGap paddedSides">
        <h1>{{ artwork?.title }}</h1>
        <!-- <div>${{ artwork?.price }}</div> -->
        <div>{{ artwork?.dimensions }}</div>
        <div><strong>About:</strong> {{ artwork?.description }}</div>
        <div v-if="artwork?.artwork_note">
          <!-- <strong>*</strong> {{ artwork?.artwork_note }} -->
        </div>
        <!-- <Button v-if="!artwork.sold" class="buttonCol" @click="confirmPayment"
          >Buy Now</Button
        >
        <Button v-else disabled class="buttonCol">Sold</Button> -->
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.imgLarge {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid var(--text-color);
  opacity: 0;
  transition: opacity 0.3s ease;
  cursor: zoom-in;
}

.imgLarge.visible {
  opacity: 1;
}

@media (min-width: 768px) {
  .imgContainer {
    width: 70vw;
    max-width: 70vw;
  }
}
@media (min-width: 1024px) {
  .imgContainer {
    height: 70vh;
    width: 50vw;
  }
}
</style>
