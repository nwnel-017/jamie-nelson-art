<script lang="ts" setup>
import "vue-sonner/style.css";
import { Toaster } from "vue-sonner";

useHead({
  titleTemplate: (titleChunk) =>
    titleChunk ? `${titleChunk} | Jamie Nelson Art` : "Jamie Nelson Art",
});

if (import.meta.server) {
  useSeoMeta({
    applicationName: "Jamie Nelson Art",
    author: "Jamie Nelson",
    creator: "Jamie Nelson",
    publisher: "Jamie Nelson Art",
    ogSiteName: "Jamie Nelson Art",
    ogLocale: "en_US",
    twitterCard: "summary_large_image",
  });
}
</script>
<template>
  <NuxtLoadingIndicator color="var(--text-color)" :height="2" />
  <LoadingOverlay />
  <NuxtLayout>
    <Toaster
      rich-colors
      position="top-center"
      :toast-options="{
        class: 'toast',
      }"
    />
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
.toast {
  z-index: 9999;
  position: fixed;
  top: 1rem;
}

.page {
  width: 100vw;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.spaceBetween {
  justify-content: space-between;
}

.centerContent {
  display: flex;
  justify-content: center;
  align-items: center;
}

.autoMargin {
  margin: auto 0;
}

.textBlock {
  padding: 0;
  text-align: center;
}

.textBlock h1 {
  margin: 0;
  padding: 0;
}

.marginTop {
  margin-top: 3rem;
}

.centerContent h1 {
  margin: 0.75rem 0;
}

.centerContainer {
  display: flex;
  justify-content: center;
  margin: 0 auto;
  width: 50vw;
  /* border: 1px solid var(--text-color); */
  border-radius: 0.5rem;
}

.verticalContent {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* .alignCenter {
  align-items: center;
} */

.spaced {
  gap: 1rem;
}

.verticalMargin {
  margin: 1rem 0;
  /* margin: 10rem 0; */
}

.horizontalContent {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fullWidth {
  width: 100%;
  /* width: 100vw; */
}

.fullHeight {
  min-height: 85dvh;
}

.fillPage {
  width: 100dvw;
  /* min-height: 100dvh; */
}

.submissionForm {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.banner {
  height: 1.5rem;
  display: flex;
  width: 100%;
  justify-content: space-between;
}

.bannerWide {
  height: 1.5rem;
  display: flex;
  width: 100%;
  justify-content: space-between;
}

.flexBetween {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.flexCenter {
  display: flex;
  justify-content: center;
  align-items: center;
}

.vertical {
  display: flex;
  flex-direction: column;
}

.spaced {
  display: flex;
  gap: 0.5rem;
}

.spaced h1 {
  margin: none;
}

.clmGap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.clmGap h1 {
  margin-bottom: 0;
}

.margin {
  margin: 3rem auto;
}

.contentCard {
  padding: 0.5rem;
  box-shadow: 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  /* gap: 1rem; */
  justify-content: space-between;
  width: 100%;
}

.header {
  font-weight: bold;
}

.padded {
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.paddedSides {
  padding: 0 0.5rem;
}

.cutoffText {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3; /* number of lines to show */
  -webkit-box-orient: vertical;
}

.cutoffTextSmall {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  /* min-width: 0; */
  width: 100%;
}

.closeHorContent {
  display: flex;
  gap: 1rem;
}

.headShot {
  max-width: 10vw;
  max-height: 10vw;
  border-radius: 8px;
}

.clickable {
  cursor: pointer;
}

.buttonCol {
  width: 100px;
}

/* .btn {
  width
} */

.border {
  border: 1px solid black;
}

.largeWidth {
  width: 80%;
}

.collectionContainer {
  width: 80%;
  padding: 0.5rem;
  background-color: var(--theme-white);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 2px 6px rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  gap: 0.5rem;
}

.collectionDetails {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: white;
  z-index: 10;
  padding: 0.3em;
  font-size: 0.9rem;
}

.collectionCard {
  width: 90%;
  height: 40vh;
}

.artworkContainer {
  padding: 0.5rem;
  background-color: var(--theme-white);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 2px 6px rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  display: flex;
  max-width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.gridItem {
  aspect-ratio: 1/1;
  overflow: hidden;
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
  max-width: 100%;
  /* grid-template-columns: repeat(3, 1fr); */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
  align-items: stretch;
}

.gap {
  gap: 1rem;
}

.collectionsGrid {
  margin: auto 0;
  display: grid;
  justify-items: center;
  align-items: center;
  min-height: 100%;
  width: 100%;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.5rem;
}

.internalCollectionsGrid {
  display: grid;
  width: 50%;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.5rem;
}

.collectionsGrid > * {
  min-width: 0;
}

.collectionImg {
  width: 90%;
  height: 40vh;
  border-radius: 8px;
  object-fit: cover;
  /* opacity: 0.4; */
  opacity: 0;
  transition: opacity 0.3s ease;
}

.collectionImg.visible {
  opacity: 0.4;
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

.imgContainer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80vw;
  /* max-width: 80vw; */
  /* max-height: 50vh; */
  height: 50vh;
  background-color: white;
  align-content: center;
  border-radius: 8px;
}

/* .imgLarge {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid var(--text-color);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.imgLarge.visible {
  opacity: 1;
} */

.artworkFull {
  width: 100%;
  height: auto;
  object-fit: cover;
  border-radius: 8px;
}

.overlay {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  position: fixed;
  background: rgba(0, 0, 0, 0.5);
  inset: 0; /* top:0 right:0 bottom:0 left:0 */
  z-index: 1;
}

.modal {
  max-width: 90%;
  background: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  border-radius: 8px;
  opacity: 1;
}

/* .btn--sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}
.btn--md {
  padding: 0.5rem 1rem;
  font-size: 1rem;
}
.btn--lg {
  padding: 0.75rem 1.25rem;
  font-size: 1.1rem;
} */

@media (min-width: 768px) {
  .banner {
    width: 90%;
  }

  .page {
    padding: 2rem;
  }

  .imgContainer {
    width: 70vw;
    max-width: 70vw;
  }

  .artworksGrid {
    width: 80%;
  }

  .imgLarge {
    max-width: 80%;
    max-height: 80%;
    /* border: 2px solid black; */
  }

  .clmGap {
    width: 70%;
  }
}

@media (min-width: 1024px) {
  .banner {
    width: 60%;
  }

  .page {
    padding: 0;
  }

  .imgContainer {
    height: 70vh;
    width: 50vw;
  }

  .artworksGrid {
    grid-template-columns: repeat(4, 1fr);
  }

  .clmGap {
    width: 50%;
  }
}
</style>
