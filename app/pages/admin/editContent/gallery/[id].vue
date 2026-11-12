<script lang="ts" setup>
import type { GalleryRow } from "~~/types/supabase/tables";
import { toast } from "vue-sonner";

// To Do: implement edit gallery functionality
// To Do: refactor - this is basically a copy of ArtworkGallery component

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Edit Gallery",
  robots: "noindex, nofollow",
});

const route = useRoute();

// To Do: fix - id will be undefined on first render
const artworkId = computed(() => route.params.id as string); // Issue

const { addArtworkImages } = useArtworks();
const { deleteImage } = useGallery();
const { startLoading, stopLoading } = useLoading();

const viewFileUpload = ref(false);


function toggleFileUpload() {
  viewFileUpload.value = !viewFileUpload.value;
}

async function uploadFiles(files: File[]) {
  console.log("Files to upload:", files);
  toggleFileUpload();

  const formData = new FormData();
  formData.append("artworkId", artworkId.value);
  files.forEach((image) => {
    formData.append(`image`, image);
  });

  try {
    startLoading();
    await addArtworkImages(artworkId.value, formData);
    toast.success("Successfully added images!");
  } catch {
    toast.error("something went wrong!");
  } finally {
    stopLoading();
  }
}

async function removePhoto(id: string) {
  console.log("removing photo!");
  const res = await deleteImage(id);
  toast(res.message);
}

const {
  data: gallery,
  pending,
  error,
} = useFetch<GalleryRow[]>(`/api/artworks/gallery/${artworkId.value}`);
</script>

<template>
  <div>
  <h1>Gallery</h1>
  <div v-if="pending">Loading gallery images...</div>
  <div v-if="error">Failed to get gallery</div>
  <FileUpload
    v-if="viewFileUpload"
    @close="toggleFileUpload"
    @upload="uploadFiles"
  />
  <div v-if="gallery">
    <div class="textBlock">
      <h1>Artworks</h1>
    </div>
    <div class="artworksGrid">
      <div v-for="g in gallery" :key="g.id" class="artworkContainer clickable">
        <NuxtImg :src="g?.image_path ?? undefined" alt="" class="artwork" />
        <Button variant="danger" @click="removePhoto(g.id)">Remove</Button>
      </div>
    </div>
  </div>
  <div v-else>No gallery images available.</div>
  <Button variant="primary" @click="toggleFileUpload">Add Photos</Button>
  </div>
</template>

<style></style>
