<script lang="ts" setup>
import type { ArtworkData } from "#types/artworks/artworks";
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

const { startLoading, stopLoading } = useLoading();
const { getArtwork, updateArtwork, removeArtwork } = useArtworks();

const route = useRoute();

const artworkId = computed(() => route.params.id as string);

const { data: artwork, pending, error } = await getArtwork(artworkId.value);

useSeoMeta({
  title: () => artwork.value?.title || "Edit Artwork",
  robots: "noindex, nofollow",
});

const editedArtwork = ref<ArtworkData>({
  title: "",
  description: "",
  dimensions: "",
  year: "",
  medium: "",
  price: "",
  collection: artwork.value?.collection_id || "",
  artwork_note: "",
  cover_image: false,
});

const image = ref<File | null>(null);

const isEditing = ref(false);

function startEdit() {
  isEditing.value = true;
  editedArtwork.value = {
    title: artwork.value?.title || "",
    description: artwork.value?.description || "",
    dimensions: artwork.value?.dimensions || "",
    year: artwork.value?.year?.toString() || "",
    medium: artwork.value?.medium || "",
    price: artwork.value?.price?.toString() || "",
    collection: artwork.value?.collection_id || "",
    artwork_note: artwork.value?.artwork_note || "",
    cover_image: artwork.value?.cover_image || false,
  };
  image.value = null;
}

function stopEdit() {
  isEditing.value = false;
  editedArtwork.value = {
    title: "",
    description: "",
    dimensions: "",
    year: "",
    medium: "",
    price: "",
    collection: artwork.value?.collection_id || "",
    artwork_note: "",
    cover_image: false,
  };
  image.value = null;
}

// To Do: move to useArtworks composable
async function save() {
  console.log("saving!");
  isEditing.value = false;
  const newTitle = editedArtwork.value.title;
  const newDesc = editedArtwork.value.description;
  const newPrice = editedArtwork.value.price;
  const newDimensions = editedArtwork.value.dimensions;
  const newYear = String(editedArtwork.value.year ?? "").trim();
  const newMedium = editedArtwork.value.medium?.trim() || "";
  const newCollection = editedArtwork.value.collection;
  const newNote = editedArtwork.value.artwork_note || "";
  const newCoverImageValue = editedArtwork.value.cover_image;
  if (!newTitle || !newDesc || !newPrice || !newDimensions || !newCollection) {
    toast.error("Please change at least one field to update the artwork");
    return;
  }

  if (
    newTitle === artwork.value?.title &&
    newDesc === artwork.value?.description &&
    newPrice === artwork.value?.price?.toString() &&
    newDimensions === artwork.value?.dimensions &&
    newYear === (artwork.value?.year?.toString() || "") &&
    newMedium === (artwork.value?.medium || "") &&
    newCollection === artwork.value?.collection_id &&
    newNote === artwork.value?.artwork_note &&
    newCoverImageValue === artwork.value?.cover_image
  ) {
    toast.error("No changes have been made!");
    return;
  }

  const form = new FormData();
  form.append("id", artworkId.value);
  form.append("title", newTitle);
  form.append("description", newDesc);
  form.append("dimensions", newDimensions);
  form.append("year", newYear);
  form.append("medium", newMedium);
  form.append("collection", newCollection);
  form.append("artwork_note", newNote);
  form.append("cover_image", newCoverImageValue?.toString() || "false");
  form.append("price", newPrice);

  try {
    startLoading();
    await updateArtwork(artworkId.value, form);
    toast.success("Artwork successfully updated!");
    await navigateTo("/admin/artworks");
  } catch (err) {
    console.log("Error updating artwork: " + err);
    toast.error("Something went wrong! Please try again");
  } finally {
    stopLoading();
  }
}

async function deleteArtwork() {
  console.log("deleting artwork!");
  isEditing.value = false;

  try {
    startLoading();
    await removeArtwork(artworkId.value);
    toast.success("Artwork deleted successfully!");
    navigateTo("/admin/artworks");
  } catch (error) {
    console.log("error deleting artwork: " + error);
    toast.error("Something went wrong. Please try again later!");
  } finally {
    stopLoading();
  }
}
</script>

<template>
  <div class="fullWidth">
    <div class="verticalContent verticalMargin paddedSides">
      <div class="horizontalContent">
        <div v-if="!isEditing">
          <div v-if="pending">Loading details...</div>
          <div v-if="error">There was an error getting artwork details</div>
          <div v-else-if="artwork">
            <div class="imgContainer">
              <NuxtImg
                :src="artwork?.image_path ?? undefined"
                alt=""
                class="artworkFull"
              />
            </div>
            <div class="artworkDetails">
              <div>
                <div><span>Title:</span> {{ artwork?.title }}</div>
                <div><span>Description:</span> {{ artwork?.description }}</div>
                <div><span>Dimensions:</span> {{ artwork?.dimensions }}</div>
                <div><span>Year:</span> {{ artwork?.year }}</div>
                <div><span>Medium:</span> {{ artwork?.medium }}</div>
                <div><span>Price:</span> ${{ artwork?.price || `$${0}` }}</div>
              </div>
            </div>
          </div>
          <div class="btnContainer">
            <Button variant="primary" size="lg" class="btn" @click="startEdit"
              >Click to Edit Artwork</Button
            >
            <Button
              variant="primary"
              size="lg"
              class="btn"
              @click="navigateTo('/admin/editContent/gallery/' + artwork?.id)"
              >Click to Edit Gallery</Button
            >
            <Button
              variant="danger"
              size="lg"
              @click="deleteArtwork"
              class="btn"
              >Click to Delete Artwork</Button
            >
          </div>
        </div>
        <div v-if="isEditing" class="verticalContent spaced">
          <label for="title">Title</label>
          <textarea v-model="editedArtwork.title" type="text"></textarea>
          <label for="description">Description</label>
          <textarea v-model="editedArtwork.description" type="text"></textarea>
          <label for="price">Price</label>
          <textarea v-model="editedArtwork.price" type="text"></textarea>
          <label for="dimensions">Size:</label>
          <textarea v-model="editedArtwork.dimensions" type="text"></textarea>
          <label for="year">Year (Optional):</label>
          <input
            id="year"
            v-model="editedArtwork.year"
            type="number"
            inputmode="numeric"
            min="1900"
            max="2100"
            step="1"
          />
          <label for="medium">Medium (Optional):</label>
          <textarea
            id="medium"
            v-model="editedArtwork.medium"
            type="text"
          ></textarea>
          <label for="artwork_note">Artwork Note (Optional):</label>
          <textarea v-model="editedArtwork.artwork_note" type="text"></textarea>
          <label for="cover_image">Cover Image</label>
          <input
            type="checkbox"
            id="cover_image"
            v-model="editedArtwork.cover_image"
          />
          <Button variant="primary" size="lg" @click="save"
            >Save Changes</Button
          >
          <Button variant="secondary" size="lg" @click="stopEdit"
            >Cancel</Button
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn {
  min-width: 170px;
}

.btnContainer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hiddenInput {
  display: none;
}

.fileInput {
  cursor: pointer;
  border: none;
  font-size: 0.8rem;
  font-weight: 500;
  font-family: inherit;
  background-color: var(--theme-blue);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.75rem;
  max-height: 2rem;
  border-radius: 6px;
  width: 170px;
  color: white;
}

.fileInput:hover {
  background: #2563eb;
  opacity: 0.9;
}

.artworkFull {
  max-width: 100%;
  max-height: 50vh;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
}
.artworkDetails {
  padding: 0.5rem 0;
  height: auto;
  margin: 0.5rem 0;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
}

.artworkDetails span {
  font-weight: bold;
}

textarea {
  border-radius: 8px;
  border-color: var(--text-color);
  width: 90%;
  font-family: inherit;
}

@media (min-width: 768px) {
  .btnContainer {
    flex-direction: row;
    justify-content: space-around;
    gap: 1rem;
  }
}

@media (min-width: 1024px) {
  textarea {
    width: 25vw;
    height: 5rem;
  }

  .btn {
    width: 200px;
  }

  .fileInput {
    width: 200px;
  }
}
</style>
