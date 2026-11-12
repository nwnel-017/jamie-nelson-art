<script lang="ts" setup>
type Direction = "up" | "down" | "left" | "right";

withDefaults(
  defineProps<{
    direction?: Direction;
    size?: string;
  }>(),
  {
    direction: "right",
    size: "1em",
  },
);

const rotationMap: Record<Direction, string> = {
  right: "0deg",
  down: "90deg",
  left: "180deg",
  up: "-90deg",
};
</script>

<template>
  <svg
    id="XMLID_287_"
    height="800px"
    width="800px"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="0 0 24 24"
    xml:space="preserve"
    class="icon"
    :style="{
      transform: `rotate(${rotationMap[direction]})`,
      fontSize: size,
    }"
  >
    <g id="next">
      <g>
        <polygon
          fill="currentColor"
          points="6.8,23.7 5.4,22.3 15.7,12 5.4,1.7 6.8,0.3 18.5,12 		"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.icon {
  height: 1.5rem;
  width: 1.5rem;
  color: var(--theme-grey);
  background-color: white;
  border: 1px solid var(--theme-grey);
  border-radius: 5px;
  padding: 0.1em;
  cursor: pointer;
}
</style>
