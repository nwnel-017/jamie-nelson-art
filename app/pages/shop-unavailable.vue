<script setup lang="ts">
definePageMeta({ layout: "artist", centerContent: true });

useSeoMeta({
  title: "Shop",
  description: "Nothing currently available from Jamie Stambolie Nelson's shop.",
});
</script>

<template>
  <section class="shopUnavailable" aria-labelledby="shop-unavailable-heading">
    <h1 id="shop-unavailable-heading">Nothing Currently Available</h1>
  </section>
</template>

<style scoped>
.shopUnavailable {
  width: 100%;
  box-sizing: border-box;
  padding: 3rem 1.5rem;
  text-align: center;
}

.shopUnavailable h1 {
  margin: 0;
  color: var(--artist-gold);
  font-size: clamp(2rem, 4vw, 5rem);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
</style>
