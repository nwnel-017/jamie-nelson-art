<script lang="ts" setup>
import { ref } from "vue";
import Button from "./button.vue";

const emit = defineEmits(["close", "upload"]);

// Each entry represents one file input; `null` means no file selected yet
const fileInputs = ref<(File | null)[]>([null]);

const onFileChange = (e: Event, index: number) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  fileInputs.value[index] = file;

  // If user selected a file in the last input, append a new empty input
  if (file && index === fileInputs.value.length - 1) {
    fileInputs.value.push(null);
  }
};

const removeInput = (index: number) => {
  fileInputs.value.splice(index, 1);
  if (fileInputs.value.length === 0) fileInputs.value.push(null);
};

const submit = () => {
  const files = fileInputs.value.filter(Boolean) as File[];
  if (files.length === 0) return;

  // Emit an `upload` event with the selected files; parent can handle upload
  emit("upload", files);
};
</script>

<template>
  <div class="overlay" @click.self.stop="emit('close')">
    <div class="modal">
      <h1>Upload Files</h1>
      <form class="verticalContent" @submit.prevent="submit">
        <label>Select Files:</label>

        <div v-for="(f, i) in fileInputs" :key="i" class="file-row">
          <input
            :id="`file-upload-${i}`"
            type="file"
            @change="(e) => onFileChange(e, i)"
          >

          <span v-if="f" class="filename">{{ f.name }}</span>

          <button
            v-if="fileInputs.length > 1"
            type="button"
            class="remove"
            @click="() => removeInput(i)"
          >
            Remove
          </button>
        </div>

        <Button type="submit" variant="primary">Upload</Button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.filename {
  font-size: 0.9rem;
  color: var(--muted, #666);
}
.remove {
  background: transparent;
  border: none;
  color: var(--danger, #b00);
  cursor: pointer;
}
</style>
