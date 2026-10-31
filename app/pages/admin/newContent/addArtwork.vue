<script lang="ts" setup>
import type { ArtworkData } from "#types/artworks/artworks.ts";
import type { DropDown } from "#types/dropdown/dropdown";
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Add Artwork",
  robots: "noindex, nofollow",
});

const { addArtwork } = useArtworks();
const { getCollections } = useCollections();

const image = ref<File | null>(null);

const artwork = reactive<ArtworkData>({
  title: "",
  description: "",
  price: "",
  dimensions: "",
  year: "",
  medium: "",
  collection: "",
  artwork_note: "",
  cover_image: false,
});

const collectionName = ref<string>("");

// To Do: research which is better - this way or using async data in artworks/id.vue
const {
  data: collections,
  pending: loadingCollections,
  error: collectionError,
} = await getCollections();

const collectionItems = computed<DropDown[]>(
  () =>
    collections.value?.map((c) => ({
      label: c.collection_name ?? "",
      value: c.id ?? "",
    })) ?? [{ label: "", value: "" }],
);

function selectCollection(collection: DropDown) {
  if (!collection) return;
  artwork.collection = collection.value;
  collectionName.value = collection.label;
  console.log("selected collection: " + artwork.collection);
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const selected = target.files?.[0] || null;
  image.value = selected;
};

const submit = async () => {
  // To Do: send ArtworkData object instead of fields
  const response = await addArtwork(
    artwork.title,
    artwork.description,
    image.value,
    artwork.dimensions,
    artwork.price,
    artwork.collection,
    artwork.artwork_note || "",
    artwork.cover_image || false,
    String(artwork.year ?? "").trim(),
    artwork.medium?.trim() || "",
  );

  if (!response.success) {
    toast.error(response.message);
    return;
  }

  toast.success(response.message);
  artwork.title = "";
  artwork.description = "";
  image.value = null;
  artwork.price = "";
  artwork.dimensions = "";
  artwork.year = "";
  artwork.medium = "";
  artwork.collection = "";
  artwork.artwork_note = "";

  await navigateTo("/admin/artworks");
};
</script>

<template>
  <div class="verticalContent">
    <h1>Add Artwork here!</h1>
    <form @submit.prevent="submit" class="submissionForm">
      <label for="title">Title</label>
      <input type="text" v-model="artwork.title" />
      <label for="description">Artwork description</label>
      <input type="text" v-model="artwork.description" />
      <label for="price">Price (USD)</label>
      <input type="text" v-model="artwork.price" inputmode="decimal" />
      <label for="dimensions">Dimensions</label>
      <input type="text" v-model="artwork.dimensions" />
      <label for="year">Year (Optional)</label>
      <input
        id="year"
        type="number"
        v-model="artwork.year"
        inputmode="numeric"
        min="1900"
        max="2100"
        step="1"
      />
      <label for="medium">Medium (Optional)</label>
      <input id="medium" type="text" v-model="artwork.medium" />
      <label for="artwork_note">Artwork Note (Optional)</label>
      <input type="text" v-model="artwork.artwork_note" />
      <label for="image">Artwork Image</label>
      <input @change="onFileChange" name="image" accept="image" type="file" />
      <div class="">
        <DropDown
          label="Collection"
          :items="collectionItems ?? []"
          @select="selectCollection"
        />
        <span>{{ collectionName }}</span>
      </div>
      <div>
        <input type="checkbox" v-model="artwork.cover_image" id="cover_image" />
        <label for="cover_image">Set as collection cover image</label>
      </div>
      <button variant="primary" type="submit" size="sm">Submit</button>
    </form>
  </div>
</template>

<style scoped>
span {
  margin-left: 0.5rem;
}
</style>
