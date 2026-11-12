<template>
  <a
    href="https://www.instagram.com/jamienelsonart?igsh=dnduYjk5amZzeTJ2&utm_source=qr"
    target="_blank"
    rel="noopener noreferrer"
  >
    <Instagram
      class="igIcon clickable"
      :class="{ [`size-${props.size || 'md'}`]: props.size }"
    />
  </a>
</template>

<script setup lang="ts">
import Instagram from "~/assets/icons/instagram.svg";

const props = defineProps<{
  size?: "sm" | "md" | "lg";
}>();
</script>

<style scoped>
.igIcon {
  color: var(--text-color);
}

a {
  text-decoration: none;
  color: inherit;
}

.size-sm {
  width: 12px;
  height: 12px;
}

.size-lg {
  width: 24px;
  height: 24px;
}

@media (min-width: 768px) {
  .size-sm {
    width: 16px;
    height: 16px;
  }
}

@media (min-width: 1024px) {
  .size-sm {
    width: 20px;
    height: 20px;
  }
  .size-lg {
    width: 32px;
    height: 32px;
  }
}
</style>
