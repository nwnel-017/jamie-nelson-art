<script lang="ts" setup>
import type { DropDown } from "#types/dropdown/dropdown";

defineProps<{ label: string; items: DropDown[] }>();

const isOpen = ref(false);
const dropdown = ref<HTMLElement | null>(null);

function handleOutsideClick(event: MouseEvent) {
  if (event.target instanceof Node && !dropdown.value?.contains(event.target)) {
    closeOptions();
  }
}

onMounted(() => document.addEventListener("click", handleOutsideClick));
onUnmounted(() => document.removeEventListener("click", handleOutsideClick));

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const closeOptions = () => {
  if (isOpen.value) isOpen.value = false;
};

const emit = defineEmits<{
  (e: "select", item: DropDown): void;
}>();

const selectItem = (item: DropDown) => {
  console.log("selected item: " + item.value);
  emit("select", item);
  closeOptions();
};
</script>

<template>
  <div ref="dropdown" class="dropdown">
    <div class="dropdownContainer">
      <Button @click.stop="toggle">{{ label }}</Button>
      <div v-show="isOpen" class="dropdownOptions" :class="{ active: isOpen }">
        <div
          v-for="(item, index) in items"
          :key="index"
          class="dropdownItem"
          @click="selectItem(item)"
        >
          {{ item.label }}
        </div>
      </div>
    </div>
    <span />
  </div>
</template>

<style scoped>
.dropdown {
  cursor: pointer;
  display: inline-block;
}

.dropdownContainer {
  display: inline-block;
  position: relative;
}

.dropdownOptions {
  position: absolute;
  top: 100%;
  margin: 0;
  z-index: 10;
  background-color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid var(--theme-grey);
  /* width: auto; */
  width: 100%;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

.dropdownItem {
  text-decoration: none;
  list-style: none;
  /* width: 100%; */
  /* width: auto; */
  /* padding: 0 auto; */
}
</style>
