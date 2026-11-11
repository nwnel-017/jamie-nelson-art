<script lang="ts" setup>
import type { Database } from "#types/supabase/database";
import type { ArtworkRow } from "~~/types/supabase/tables";
import type { GalleryRow } from "~~/types/supabase/tables";
import VueEasyLightbox from "vue-easy-lightbox";
import ArrowIcon from "~/components/icons/ArrowIcon.vue";
import ZoomIn from "~/assets/icons/zoom-in.svg";

definePageMeta({ layout: "artist" });

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

const currentImagePath = computed(
  () => currentImage.value?.image_path || artwork.value?.image_path || undefined,
);

const imageCount = computed(() => galleryImages.value?.length ?? 0);

const viewerImage = computed<string[]>(() => {
  const path = currentImagePath.value;
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
  <div class="artworkRoot">
    <section
      v-if="artwork"
      class="artworkPage"
      :class="{ hasCounter: imageCount > 1 }"
      aria-labelledby="artwork-heading"
    >
      <ClientOnly>
        <VueEasyLightbox
          :visible="lightboxVisible"
          @hide="closeLightBox"
          :imgs="viewerImage"
      /></ClientOnly>
      <div class="artworkMedia">
        <div class="artworkCard">
          <div class="imageFrame" :class="{ isLoading: !imageLoaded }">
            <NuxtImg
              :src="currentImagePath"
              :alt="artwork.title || 'Artwork'"
              class="artworkImage"
              format="webp"
              quality="72"
              sizes="100vw md:50vw lg:45vw"
              loading="eager"
              fetchpriority="high"
              :class="{ visible: imageLoaded }"
              @load="loadImage"
              @click="viewLightBox"
            />
            <Lottie
              v-if="!imageLoaded"
              name="img-placeholder"
              class="imgOverlay"
            />
            <button
              type="button"
              class="zoomButton"
              aria-label="View full size"
              @click="viewLightBox"
            >
              <ZoomIn aria-hidden="true" />
            </button>
            <template v-if="imageCount > 1">
              <button
                type="button"
                class="navButton previous"
                aria-label="Previous image"
                @click="prevImage"
              >
                <ArrowIcon direction="left" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="navButton next"
                aria-label="Next image"
                @click="nextImage"
              >
                <ArrowIcon aria-hidden="true" />
              </button>
            </template>
          </div>
        </div>
        <p v-if="imageCount > 1" class="imageCount" aria-live="polite">
          Image {{ currentIndex + 1 }} of {{ imageCount }}
        </p>
      </div>
      <div class="artworkInfo">
        <h1 id="artwork-heading">{{ artwork?.title }}</h1>
        <!-- <div>${{ artwork?.price }}</div> -->
        <p v-if="artwork?.year" class="artworkYear">{{ artwork.year }}</p>
        <p v-if="artwork?.dimensions">{{ artwork.dimensions }}</p>
        <p v-if="artwork?.medium">{{ artwork.medium }}</p>
        <p v-if="artwork?.description" class="artworkDescription">
          {{ artwork.description }}
        </p>
        <div v-if="artwork?.artwork_note">
          <!-- <strong>*</strong> {{ artwork?.artwork_note }} -->
        </div>
        <!-- <Button v-if="!artwork.sold" class="buttonCol" @click="confirmPayment"
          >Buy Now</Button
        >
        <Button v-else disabled class="buttonCol">Sold</Button> -->
      </div>
    </section>
  </div>
</template>

<style scoped>
.artworkPage {
  --imageMaxHeight: 75vh;
  width: min(88.5%, 120rem);
  margin: 0 auto;
  padding: 2.5rem 0 5rem;
  display: grid;
  gap: 2.5rem;
  align-items: start;
}

.artworkMedia {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.artworkCard {
  width: fit-content;
  max-width: 100%;
  padding: 1rem;
  background: #fff;
  border-radius: 12px;
}

.imageFrame {
  position: relative;
  max-width: 100%;
}

.imageFrame.isLoading {
  width: min(100vw - 2 * 5.75vw - 2rem, 35rem);
  aspect-ratio: 4 / 5;
}

.artworkImage {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: var(--imageMaxHeight);
  opacity: 0;
  transition: opacity 0.3s ease;
  cursor: zoom-in;
}

.artworkImage.visible {
  opacity: 1;
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

.zoomButton,
.navButton {
  position: absolute;
  z-index: 11;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: #111;
  cursor: pointer;
}

.zoomButton:hover,
.navButton:hover {
  background: #fff;
}

.zoomButton:focus-visible,
.navButton:focus-visible {
  outline: 2px solid var(--artist-gold);
  outline-offset: 2px;
}

.zoomButton {
  top: 0.5rem;
  left: 0.5rem;
  width: 2.25rem;
  height: 2.25rem;
}

.zoomButton svg {
  width: 1.4rem;
  height: 1.4rem;
}

.navButton {
  top: 50%;
  transform: translateY(-50%);
  width: 2.75rem;
  height: 2.75rem;
}

.navButton.previous {
  left: 0.5rem;
}

.navButton.next {
  right: 0.5rem;
}

.navButton svg {
  width: 1.1rem;
  height: 1.1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
}

.imageCount {
  margin: 0.75rem 0 0;
  font-size: 1rem;
  line-height: 1.5;
}

.artworkInfo {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1em;
  font-size: clamp(1.25rem, 2.25vw, 2.75rem);
  line-height: 1.2;
}

.artworkInfo h1 {
  margin: 0 0 0.25em;
  color: var(--artist-gold);
  font-size: clamp(2.25rem, 3.8vw, 5rem);
  line-height: 1.1;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.artworkInfo p {
  margin: 0;
  overflow-wrap: anywhere;
}

.artworkYear {
  font-weight: 700;
}

.artworkInfo .artworkDescription {
  max-width: 40em;
  margin-top: 0.5em;
  font-size: clamp(1rem, 1.25vw, 1.5rem);
  line-height: 1.4;
  white-space: pre-line;
}

@media (min-width: 768px) {
  .artworkRoot {
    height: 100%;
    container-type: size;
  }

  .artworkPage {
    --pagePaddingY: clamp(2rem, 4vw, 5rem);
    --counterSpace: 0rem;
    --imageMaxHeight: max(
      18rem,
      100cqh - 2 * var(--pagePaddingY) - 2rem - var(--counterSpace)
    );
    box-sizing: border-box;
    min-height: 100%;
    grid-template-columns: minmax(0, 45%) minmax(0, 1fr);
    align-content: center;
    gap: 5vw;
    padding: var(--pagePaddingY) 0;
  }

  .artworkPage.hasCounter {
    --counterSpace: 2.25rem;
  }

  .imageFrame.isLoading {
    width: min(88.5vw * 0.45 - 2rem, 35rem, var(--imageMaxHeight) * 0.8);
  }

  .artworkInfo {
    padding-top: 1.5vw;
  }
}

@media (min-width: 1100px) {
  .artworkPage {
    width: min(78.75%, 120rem);
    grid-template-columns: minmax(0, 37%) minmax(0, 1fr);
    gap: 9.5vw;
  }

  .imageFrame.isLoading {
    width: min(78.75vw * 0.37 - 2rem, 44rem, var(--imageMaxHeight) * 0.8);
  }
}
</style>
