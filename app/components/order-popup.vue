<script lang="ts" setup>
import type { OrderRow } from "~~/types/supabase/tables";
import { formatFunds } from "#imports";
defineProps<{ order?: OrderRow }>();

const emit = defineEmits<{
  (e: "cancel"): void;
}>();
</script>

<template>
  <div class="overlay" @click.self.stop="emit('cancel')">
    <div class="modal">
      <h1>Order Details</h1>
      <div v-if="order">
        <div>{{ order.buyer_name }}</div>
        <div>{{ order.buyer_email }}</div>
        <div>Shipping Address: {{ order.address_line_1 }}</div>
        <div v-if="order.address_line_2">
          Line 2: {{ order.address_line_2 }}
        </div>
        <div>Shipping amount paid: {{ formatFunds(order.shipping_cost) }}</div>
      </div>
    </div>
  </div>
</template>
