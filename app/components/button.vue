<script setup lang="ts">
defineOptions({ name: "AppButton" });
type Variant = "primary" | "secondary" | "danger" | "ghost";
// type Size = "sm" | "md" | "lg";

const props = defineProps<{
  variant?: Variant;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}>();

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const onClick = (event: MouseEvent) => {
  if (!props.disabled) emit("click", event);
};

// Default values
const variant = props.variant ?? "primary";
// const size = props.size ?? "md";
const type = props.type ?? "button";
</script>

<template>
  <button
    :class="[
      'btn',
      `btn--${variant}`,
      // `btn--${size}`,
      { 'btn--disabled': disabled },
    ]"
    :disabled="disabled"
    :type="type"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  cursor: pointer;
  border: none;
  font-weight: 500;
  border-radius: 6px;
  transition:
    background 0.2s,
    opacity 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  max-height: 2rem;
  /* max-width: 2rem; */
}

/* .btn--sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}
.btn--md {
  padding: 0.5rem 1rem;
  font-size: 1rem;
}
.btn--lg {
  padding: 0.75rem 1.25rem;
  font-size: 1.1rem;
} */

.btn--primary {
  background: var(--theme-blue);
  color: white;
}
.btn--primary:hover {
  background: #2563eb;
}

.btn--secondary {
  background: #e5e7eb;
  color: #374151;
}
.btn--secondary:hover {
  background: #d1d5db;
}

.btn--danger {
  background: #ef4444;
  color: white;
}
.btn--danger:hover {
  background: #dc2626;
}

.btn--ghost {
  background: transparent;
  color: #374151;
  border: 1px solid #e5e7eb;
}
.btn--ghost:hover {
  background: #f3f4f6;
}

.btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (min-width: 768px) {
  .btn {
    padding: 0.5rem 1rem;
    font-size: 1rem;
  }
}
</style>
