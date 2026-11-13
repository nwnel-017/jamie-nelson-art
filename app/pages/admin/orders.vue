<script lang="ts" setup>
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Admin Orders",
  robots: "noindex, nofollow",
});

const { getOrders } = useOrders();
const { startLoading, stopLoading } = useLoading();

const { data: orders, pending, error } = await getOrders();

const selectedOrder = ref<string | null>(null);
const showOrderDetails = ref(false);
const showOrderOptions = ref(false);

function changeOrderStatus(id: string) {
  selectedOrder.value = id;
  showOrderOptions.value = true;
}

// TO DO: move to composable
// TO DO: find some better way than manually refreshing page`after status change
async function updateOrderStatus(item: string) {
  if (!item) return;

  try {
    startLoading();
    await $fetch("/api/orders/status", {
      method: "POST",
      body: {
        orderId: selectedOrder.value,
        status: item,
      },
    });
    toast.success("Status changed successfully!");
  } catch (err) {
    console.log("Error from backend: " + err);
    toast.error("Something went wrong!");
  } finally {
    selectedOrder.value = null;
    showOrderOptions.value = false;
    // window.location.reload();
    stopLoading();
    window.location.reload();
  }
}

function cancelStatusChange() {
  selectedOrder.value = null;
  showOrderOptions.value = false;
}

function cancelViewOrder() {
  selectedOrder.value = null;
  showOrderDetails.value = false;
}

function viewOrder(id: string) {
  if (!id) return;
  selectedOrder.value = id;
  showOrderDetails.value = true;
}
</script>

<template>
  <div class="verticalContent">
    <PopupOptions
      v-if="showOrderOptions"
      :items="['PAID', 'SHIPPED', 'DELIVERED']"
      @cancel="cancelStatusChange"
      @select="updateOrderStatus"
    />
    <OrderPopup
      v-if="showOrderDetails"
      :order="orders?.find((o) => o.id === selectedOrder)"
      @cancel="cancelViewOrder"
    />
    <h1>Orders</h1>
    <div v-if="pending">Loading orders</div>
    <div v-else-if="error">Something went wrong</div>
    <div v-else>
      <div v-if="orders">
        <div class="contentCard clickable">
          <div class="orderGrid">
            <span class="header">Buyer Name</span>
            <span class="header">Amount</span>
            <span class="header email">Status</span>
            <span class="header">Address</span>
            <span class="header date">Date Created</span>
            <span />
            <span />
            <template v-for="order in orders" :key="order.id">
              <span class="clickable">{{ order?.buyer_name }}</span>
              <span class="clickable">${{ order?.amount }}</span>
              <span class="email clickable">{{ order?.status }}</span>
              <span class="cutoffText clickable">{{
                order?.address_line_1
              }}</span>
              <span class="date clickable">{{
                formatDateShort(order?.created_at) ?? ""
              }}</span>
              <Button @click.stop="changeOrderStatus(order.id)"
                >Change Status</Button
              >
              <Button variant="secondary" @click.stop="viewOrder(order.id)"
                >View Details</Button
              >
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.orderGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* border: 1px solid var(--text-color); */
  border-radius: 10px;
  padding: 1rem;
  margin: 0 auto;
  background-color: var(--theme-white);
  gap: 1rem;
  width: 100%;
}

.date {
  display: none;
}

.email {
  display: none;
}

@media (min-width: 768px) {
}

@media (min-width: 1024px) {
  .date {
    display: block;
  }

  .email {
    display: block;
  }

  .orderGrid {
    grid-template-columns: repeat(7, 1fr);
  }
}
</style>
