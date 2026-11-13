<script lang="ts" setup>
import type { ArtworkRow } from "~~/types/supabase/tables";
import type { CollectionDetails } from "~~/types/collections/collection";

definePageMeta({
  layout: "default",
});

const route = useRoute();

const collectionId = computed(() => route.params.id as string);

const { data: artworks } = await useFetch<ArtworkRow[]>(`/api/collections/${collectionId.value}`);

const { data: collectionDetails } = await useFetch<CollectionDetails>(
  `/api/collections/details/${collectionId.value}`,
);

useSeoMeta({
  title: () => collectionDetails.value?.collection_name || "Collection",
  description: () =>
    collectionDetails.value?.desc ||
    `Explore artworks from the ${collectionDetails.value?.collection_name || "featured"} collection by Jamie Nelson.`,
  ogTitle: () => collectionDetails.value?.collection_name || "Collection",
  ogDescription: () =>
    collectionDetails.value?.desc ||
    `Explore artworks from the ${collectionDetails.value?.collection_name || "featured"} collection by Jamie Nelson.`,
});

</script>

<template>
  <div class="verticalContent fullWidth">
    <ArtworkGallery
      :artworks="artworks ?? []"
      :collection="collectionDetails"
    />
  </div>
</template>
