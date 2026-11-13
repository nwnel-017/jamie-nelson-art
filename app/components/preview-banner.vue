<script setup lang="ts">
function approveDesign() {
  console.log("Preview Mode: approve design");
}

function rejectDesign() {
  console.log("Preview Mode: reject design");
}
</script>

<template>
  <aside class="preview-banner" aria-label="Design preview">
    <strong>Preview Mode</strong>
    <div class="preview-actions">
      <button type="button" @click="approveDesign">approve design</button>
      <button type="button" @click="rejectDesign">reject design</button>
    </div>
  </aside>
</template>

<style scoped>
.preview-banner {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 2147483647;
  max-width: calc(100vw - 2rem);
  padding: 1rem;
  border: 1px solid var(--theme-grey);
  border-radius: 8px;
  background: white;
  color: var(--text-color);
  box-shadow: 0 4px 20px rgb(0 0 0 / 15%);
}

.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.preview-actions button {
  padding: 0.5rem 0.75rem;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: white;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.preview-actions button:hover {
  background: var(--theme-off-white);
}
</style>
