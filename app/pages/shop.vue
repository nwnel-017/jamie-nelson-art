<script lang="ts" setup>
import type { ArtworkRow } from "~~/types/supabase/tables";

definePageMeta({ layout: "artist" });

useSeoMeta({
  title: "Shop",
  description:
    "Buy original mixed media artworks by Jamie Stambolie Nelson.",
  ogTitle: "Shop",
  ogDescription:
    "Buy original mixed media artworks by Jamie Stambolie Nelson.",
});

const { data: artworks, error } = await useFetch<ArtworkRow[]>(
  "/api/artworks/artworks",
);

const shopArtworks = computed(
  () =>
    artworks.value?.filter(
      (artwork) => artwork.sold === false && artwork.image_path,
    ) ?? [],
);

const artworkTitle = (artwork: ArtworkRow) =>
  artwork.title || "Untitled artwork";

const formatPrice = (price: number) =>
  `USD$${price.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
</script>

<template>
  <section class="artistShop" aria-labelledby="shop-heading">
    <h1 id="shop-heading">Shop</h1>
    <p v-if="error" class="statusMessage">
      The shop could not be loaded. Please try again later.
    </p>
    <p v-else-if="!shopArtworks.length" class="statusMessage">
      New artworks are coming soon.
    </p>
    <ul v-else class="shopGrid">
      <li
        v-for="(artwork, index) in shopArtworks"
        :key="artwork.id"
        class="shopItem"
      >
        <div class="artworkFrame">
          <NuxtLink
            class="artworkMat"
            :to="`/artworks/${artwork.id}`"
            tabindex="-1"
            aria-hidden="true"
          >
            <NuxtImg
              :src="artwork.image_path ?? undefined"
              :alt="artworkTitle(artwork)"
              class="artworkImage"
              format="webp"
              quality="80"
              sizes="100vw md:45vw lg:25vw"
              :loading="index < 4 ? 'eager' : 'lazy'"
              :fetchpriority="index < 4 ? 'high' : 'auto'"
            />
          </NuxtLink>
        </div>
        <div class="artworkDetails">
          <p class="artworkInfo">
            <NuxtLink class="artworkTitle" :to="`/artworks/${artwork.id}`">
              {{ artworkTitle(artwork)
              }}<template v-if="artwork.year">, {{ artwork.year }}</template>
            </NuxtLink>
            <span v-if="artwork.dimensions" class="artworkDimensions">
              {{ artwork.dimensions }}
            </span>
          </p>
          <p v-if="artwork.price !== null" class="artworkPrice">
            {{ formatPrice(artwork.price) }}
          </p>
          <button
            type="button"
            class="buyButton"
            :aria-label="`Buy now: ${artworkTitle(artwork)}`"
          >
            Buy now
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.artistShop {
  --headingSize: clamp(3rem, 3.8vw, 5rem);
  --headingGap: 2.5rem;
  width: min(100% - 2rem, 120rem);
  margin: 0 auto;
  padding: 2.5rem 0 5rem;
}

.artistShop h1 {
  margin: 0 0 var(--headingGap);
  color: var(--artist-gold);
  font-size: var(--headingSize);
  line-height: 1.1;
  font-weight: 700;
  text-align: center;
}

.statusMessage {
  margin: 0;
  text-align: center;
  font-size: clamp(1.125rem, 1.65vw, 2.125rem);
  line-height: 1.2;
}

.shopGrid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 3.5rem;
  align-items: start;
}

.shopItem {
  min-width: 0;
  container-type: inline-size;
}

.artworkFrame {
  display: flex;
  align-items: center;
  justify-content: center;
}

.artworkMat {
  display: block;
  padding: 8cqi;
  background: #fff;
}

.artworkImage {
  display: block;
  width: auto;
  height: auto;
  max-width: 84cqi;
  max-height: 66cqi;
}

.artworkDetails {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: clamp(1.125rem, 1.65vw, 2.125rem);
  line-height: 1;
  text-align: center;
}

.artworkDetails p {
  margin: 0;
}

.artworkInfo {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.artworkTitle {
  color: inherit;
  text-decoration: none;
}

.artworkTitle:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.artworkTitle:focus-visible,
.buyButton:focus-visible {
  outline: 2px solid var(--artist-gold);
  outline-offset: 5px;
}

.artworkDetails .artworkPrice {
  margin-top: 0.75em;
}

.buyButton {
  margin-top: 0.9em;
  min-width: 8.75em;
  padding: 0.35em 1em;
  border: 0;
  border-radius: 0;
  background: var(--artist-gold);
  color: var(--artist-blue);
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
}

@media (min-width: 768px) {
  .artistShop {
    --headingGap: 3vw;
    --pagePadding: clamp(1.5rem, 2.5vw, 4rem);
    --columns: 2;
    --columnGap: 4vw;
    --detailsSize: clamp(1.125rem, 1.65vw, 2.125rem);
    --rowHeight: max(
      22rem,
      100cqh - var(--headingSize) * 1.1 - var(--headingGap) -
        var(--pagePadding)
    );
    --frameHeight: calc(
      (100cqi - (var(--columns) - 1) * var(--columnGap)) / var(--columns) *
        0.82
    );
    --detailsHeight: calc(var(--detailsSize) * 7.55 + 1.9vw);
    box-sizing: border-box;
    width: min(81.5%, 120rem);
    height: 100%;
    padding: var(--pagePadding) 0 0;
    container-type: size;
  }

  .shopGrid {
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    grid-auto-rows: var(--rowHeight);
    gap: 5vw var(--columnGap);
    align-items: stretch;
    padding-bottom: var(--pagePadding);
  }

  .shopItem {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding-top: max(
      0px,
      (var(--rowHeight) - var(--frameHeight) - var(--detailsHeight)) / 2
    );
  }

  .artworkFrame {
    --matPadding: min(8cqi, 8cqh);
    flex: 0 1 auto;
    aspect-ratio: 1 / 0.82;
    min-height: 0;
    container-type: size;
  }

  .artworkMat {
    padding: var(--matPadding);
  }

  .artworkImage {
    max-width: calc(100cqi - 2 * var(--matPadding));
    max-height: calc(100cqh - 2 * var(--matPadding));
  }

  .artworkDetails {
    margin-top: 1.9vw;
    align-items: flex-start;
    text-align: left;
  }

  .artworkInfo {
    align-items: flex-start;
  }
}

@media (min-width: 1100px) {
  .artistShop {
    --columns: 4;
  }
}
</style>
