<script lang="ts" setup>
import type { ArtworkRow } from "~~/types/supabase/tables";
import { formatDateShort } from "~/utils/date";
import { computed } from "vue";

const { artwork } = defineProps<{
  artwork: ArtworkRow;
}>();

const emit = defineEmits(["close", "checkout"]);

const formattedDate = computed(() => formatDateShort(artwork?.created_at));
</script>

<template>
  <div class="overlay" @click.self.stop="emit('close')">
    <div class="modal">
      <h1>{{ artwork?.title }}</h1>
      <NuxtImg
        :src="artwork?.image_path ?? undefined"
        alt=""
        class="artworkFull"
        placeholder
        format="webp"
        quality="70"
        sizes="(max-width: 768px) 15rem, (max-width: 1024px) 25rem, 35rem"
      />
      <div class="textContent">
        <div>{{ artwork?.description }}</div>
        <div>Dimensions: {{ artwork?.dimensions }}</div>
        <div>Price: ${{ artwork?.price }}</div>
        <div>Created: {{ formattedDate }}</div>
      </div>
      <Button @click.self.stop="emit('checkout')">Buy Now</Button>
    </div>
  </div>
</template>

<style>
.artworkFull {
  max-width: 15rem;
  max-height: 15rem;
  border-radius: 8px;
}

.textContent {
  margin: 0.5rem 0;
  width: 100%;
  /* border: 2px solid black; */
}

@media (min-width: 768px) {
  .artworkFull {
    max-width: 25rem;
    max-height: 25rem;
  }
}

@media (min-width: 1024px) {
  .artworkFull {
    max-width: 35rem;
    max-height: 35rem;
  }
}
</style>
