<script lang="ts" setup>
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Add Collection",
  robots: "noindex, nofollow",
});

const newCollection = ref("");

async function submit() {
  if (!newCollection.value) {
    toast.error("Please enter a valid value!");
  }

  const collectionName = newCollection.value;

  const res = await $fetch("/api/collections/collection", {
    method: "POST",
    body: { name: collectionName },
  });

  toast(res.message);

  await navigateTo("/admin/collections/collections");
}
</script>

<template>
  <div class="spaced vertical">
    <h1>Add Collection</h1>
    <div class="spaced">
      <label for="title">New Collection:</label>
      <input v-model="newCollection" type="text" >
    </div>
    <Button class="buttonCol" @click="submit">Submit</Button>
  </div>
</template>
