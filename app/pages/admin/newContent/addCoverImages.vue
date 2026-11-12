<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Add Cover Image",
  robots: "noindex, nofollow",
});

const { addCoverImage } = useArtworks();
const { startLoading, stopLoading } = useLoading();

const image = ref<File | null>(null);

async function submit() {
  if (!image.value) return;
  const form = new FormData();
  form.append("image", image.value);
  try {
    startLoading();
    await addCoverImage(form);
    toast.success("Successfully added image!");
    await navigateTo("/admin/coverImages");
  } catch {
    toast.error("Something went wrong!");
  } finally {
    stopLoading();
  }
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const selected = target.files?.[0] || null;
  image.value = selected;
};
</script>

<template>
  <div class="spaced vertical">
    <h1>Add Cover Image for Landing Page</h1>
    <div class="spaced">
      <label for="image">New Image:</label>
      <input name="image" accept="image" type="file" @change="onFileChange" >
    </div>
    <Button class="buttonCol" @click="submit">Submit</Button>
  </div>
</template>
