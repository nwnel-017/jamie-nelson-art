<script lang="ts" setup>
import { paymentsEnabled } from "@utils/payments";
import type { ArtworkRow } from "~~/types/supabase/tables";

const { payWithStripe } = usePayments();

useSeoMeta({
  title: "Confirm Payment",
  robots: "noindex, nofollow",
});

const route = useRoute();
const id = computed(() => route.params.id as string);

const {
  data: artwork,


} = await useFetch<ArtworkRow>(`/api/artworks/${id.value}`);

</script>

<template>
  <div class="payment-confirmation verticalContent page">
    <div class="center-container">
      <h2 class="center">Confirm Payment</h2>
      <div class="payment-item">
        <div class="artwork-container">
          <NuxtImg
            class="artwork-image"
            :src="artwork?.image_path ?? undefined"
            alt=""
            format="webp"
            quality="70"
            width="80"
            height="80"
            sizes="80px"
          />
        </div>
        <div class="detail-container">
          <div class="underlined">
            <div>{{ artwork?.title }}</div>
            <div>${{ artwork?.price }}</div>
          </div>
        </div>
      </div>

      <div class="order-total">
        <h3>Order Total: ${{ artwork?.price }}</h3>
      </div>
      <div class="flexCenter">
        <Button
          class="btn"
          :disabled="!paymentsEnabled || !artwork?.title"
          @click="artwork?.title && payWithStripe(artwork.id, artwork.title)"
        >Confirm</Button>
        <p v-if="!paymentsEnabled">Payments are temporarily unavailable.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn {
  min-width: 150px;
}

.center-container {
  width: 70%;
}

.detail-container {
  display: flex;
  width: 100%;
  height: 100%;
  justify-content: space-between;
  align-items: center;
  /* border-bottom: 1px solid var(--text-color); */
}

.payment-item {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: end;
  width: 100%;
  height: 5rem;
  border-bottom: 1px dotted var(--theme-grey);
  /* padding: 0.5rem 0; */
}

.payment-item span {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: end;
}

.underlined {
  display: flex;
  justify-content: space-between;
  width: 100%;
  border-bottom: 1px dotted var(--theme-grey);
}

.flexRight {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}

.payment-confirmation {
  margin: 0 auto;
}

.center {
  display: flex;
  width: 100%;
  justify-content: center;
}

.order-details {
  margin-top: 20px;
}

.order-grid {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
  /* border-bottom: 1px solid var(--text-color); */
}

.order-grid th,
.order-grid td {
  padding: 1rem;
  text-align: left;
  /* display: flex; */
}

.order-grid th {
}

.artwork-container {
  position: relative;
  width: 5rem;
  height: 5rem;
  text-align: center;
  display: flex;
  justify-content: flex-end;
  flex-direction: column;
}

.artwork-image {
  /* width: 100%; */
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* position: absolute; */
  /* bottom: 0; */
}

.order-total {
  text-align: right;
  font-size: 1.2em;
  margin-top: 20px;
}

@media (min-width: 768px) {
  .center-container {
    width: 40%;
  }
}

@media (min-width: 1024px) {
  .center-container {
    width: 25%;
    margin-top: 5rem;
  }
}
</style>
