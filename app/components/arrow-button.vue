<script lang="ts" setup>
import ArrowIcon from "./icons/ArrowIcon.vue";

withDefaults(
  defineProps<{
    direction?: "up" | "down" | "left" | "right";
    size?: string;
    disabled?: boolean;
  }>(),
  {
    direction: "right",
    size: "1rem",
    disabled: false,
  },
);
</script>

<template>
  <ArrowIcon
    :direction="direction"
    :size="size"
    class="arrow"
    :class="direction"
  />
</template>

<style scoped>
.arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}

.arrow.left {
  left: 0;
}

.arrow.right {
  right: 0;
}
</style>
