<script lang="ts" setup>
defineProps<{
  items: string[];
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "select", value: string): void;
}>();

function selectItem(item: string) {
  emit("select", item);
}
</script>

<template>
  <div class="overlay" @click.self.stop="emit('cancel')">
    <div class="modal">
    <div class="submissionForm">
      <h1>New Order Status</h1>
      <!-- <div class="submissionForm"> -->
        <Button
          v-for="item in items"
          :key="item"
          variant="secondary"
          @click="selectItem(item)"
          >{{ item }}</Button
        >
      <!-- </div> -->
      <Button variant="danger" @click="emit('cancel')">Cancel</Button>
    </div>
    </div>
  </div>
</template>

<style>
.overlay {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  position: fixed;
  background: rgba(0, 0, 0, 0.5);
  inset: 0; /* top:0 right:0 bottom:0 left:0 */
  z-index: 1;
}

.modal {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  opacity: 1;
}
</style>
