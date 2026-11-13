<script setup lang="ts">
import type { CoverImageRow } from "~~/types/supabase/tables";
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Admin Cover Images",
  robots: "noindex, nofollow",
});

const { removeCoverImage } = useArtworks();
const { startLoading, stopLoading } = useLoading();

const {
  data: coverImages,
  pending,
  error,
} = await useFetch<CoverImageRow[]>("/api/artworks/coverImages/coverImages");

async function addImage() {
  await navigateTo("/admin/newContent/addCoverImages");
}

async function removeImage(id: number) {
  try {
    startLoading();
    await removeCoverImage(id);
    toast.success("Image has been removed!");
  } catch {
    toast.error("Something went wrong");
  } finally {
    stopLoading();
  }
}
</script>

<template>
  <div class="verticalContent padded marginTop">
    <div class="textBlock horizontalContent spaceBetween largeWidth">
      <h1>Cover images</h1>
      <Button class="buttonCol" @click="addImage">Add</Button>
    </div>
    <div v-if="pending">Loading...</div>
    <div v-else-if="error">Something went wrong</div>
    <div v-else-if="coverImages" class="collectionsGridInternal">
      <div
        v-for="image in coverImages"
        :key="image.id"
        class="collectionContainer clickable"
      >
        <NuxtImg
          :src="image?.image_path ?? undefined"
          alt=""
          class="collectionImg visible"
        />
        <div class="collectionDetails">
          <Button variant="danger" @click="removeImage(image.id)"
            >Remove</Button
          >
        </div>
      </div>
    </div>
  </div>
</template>
