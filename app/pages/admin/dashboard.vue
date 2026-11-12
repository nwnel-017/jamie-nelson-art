<script lang="ts" setup>
definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Admin Dashboard",
  robots: "noindex, nofollow",
});

const { getStats } = useDashboard();
const { getArtworks } = useArtworks();
const { getOrders } = useOrders();
const { startLoading, stopLoading } = useLoading();

const {
  data: stats,
  pending: loadingStats,

} = await getStats();
const {
  data: artworks,
  pending: loadingArtworks,

} = await getArtworks();
const {
  data: orders,
  pending: loadingOrders,

} = await getOrders();

const isLoading = computed(
  () => loadingStats.value || loadingArtworks.value || loadingOrders.value,
);

watch(isLoading, (loading) => {
  if (loading) {
    startLoading();
  } else {
    stopLoading();
  }
});
</script>

<template>
  <div class="verticalMargin">
    <div v-if="isLoading" />
    <div v-else>
      <section>
        <div><h3>Dashboard Overview</h3></div>
        <div class="verticalContent">
          <div>
            <div class="dashPanel">
              <div class="panel">
                <div class="statCard">
                  <span>{{ stats?.artworks }}</span
                  >Artworks
                </div>
              </div>
              <div class="panel">
                <div class="statCard">
                  <span>{{ formatFunds(stats?.fundsRaised || 0) }}</span
                  >Raised
                </div>
              </div>
              <div class="panel">
                <div class="statCard">
                  <span>{{ stats?.orders }}</span
                  >Orders
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section>
        <div><h3>Recent Activity</h3></div>
        <div
          v-if="artworks && artworks.length > 0"
          class="recentArtworks"
          @click="navigateTo('/admin/artworks')"
        >
          <div
            v-for="artwork in artworks.slice(0, 2)"
            :key="artwork?.id"
            class="artworkCard"
          >
            <div class="dashArtworkContainer">
              <NuxtImg
                :src="artwork?.image_path ?? undefined"
                :alt="artwork?.title ?? 'Artwork'"
                class="cardImage"
              />
            </div>
            <p class="cutoffText">{{ artwork?.title }}</p>
          </div>
        </div>
        <div v-else class="noArtworks">No artworks yet</div>
      </section>
      <div><h3>Recent Orders</h3></div>
      <section>
        <div
          v-if="orders && orders.length > 0"
          class="recentArtworks"
          @click="navigateTo('/admin/orders')"
        >
          <div
            v-for="order in orders.slice(0, 2)"
            :key="order?.id"
            class="artworkCard"
          >
            <p class="cutoffText">${{ order?.amount }}</p>
            <p class="cutoffText">{{ order?.buyer_name }}</p>
          </div>
        </div>
        <div v-else class="noArtworks">No orders yet</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.recentArtworks {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dashOverview {
  display: flex;
  flex-direction: column;
  height: 20vh;
  padding: 0;
  border: 1px solid var(--text-color);
}

.dashPanel {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 8px;
}

.panel {
  width: 5rem;
  height: 5rem;
  border: 1px solid var(--theme-grey);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.panel span {
  font-size: 0.9rem;
  font-weight: bold;
}

.statCard {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  align-items: left;
}

.artworkCard {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--text-color);
  border-radius: 8px;
  padding: 0 0.5rem;
  cursor: pointer;
}

.dashArtworkContainer {
  width: 50px;
  height: 50px;
  border: 1px solid var(--theme-grey);
  background-color: black;
  border-radius: 8px;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (min-width: 1024px) {
  .panel {
    width: 10rem;
    height: 8rem;
  }

  .panel span {
    font-size: 1.7rem;
  }
}
</style>
