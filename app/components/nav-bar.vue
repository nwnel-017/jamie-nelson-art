<script lang="ts" setup>
import { ref } from "vue";
import { iso } from "zod";

const isOpen = ref(false);

const toggleNav = () => {
  isOpen.value = !isOpen.value;
  console.log("Toggled nav to:", isOpen.value);
};

const closeNav = () => {
  isOpen.value = false;
};
</script>

<template>
  <div>
    <div class="navBar">
      <div class="navHeader">JAMIE NELSON ART</div>
      <div class="linkItems" :class="{ expanded: isOpen }">
        <div class="verticalSpaced">
          <NuxtLink to="/" class="dashLink" @click="closeNav">HOME</NuxtLink>
          <NuxtLink
            to="/collections/collections"
            @click="closeNav"
            class="dashLink"
            >ORIGINAL ARTWORKS</NuxtLink
          >
          <NuxtLink to="/artworks/gallery" class="dashLink" @click="closeNav"
            >GALLERY</NuxtLink
          >
          <NuxtLink to="/about" class="dashLink" @click="closeNav"
            >ABOUT THE ARTIST</NuxtLink
          >
          <!-- <NuxtLink to="/commissions" class="dashLink" @click="closeNav"
            >COMMISSIONS</NuxtLink
          > -->
          <NuxtLink to="/contact" class="dashLink" @click="closeNav"
            >CONTACT</NuxtLink
          >
        </div>
      </div>
      <div
        @click="toggleNav"
        class="hamburger"
        :class="{ open: isOpen }"
        role="button"
        :aria-expanded="isOpen"
      >
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
</template>

<style>
.border {
  border: 5px solid black;
}

.navHeader {
  font-weight: bold;
  font-size: 1.5rem;
}

.navBar {
  width: 100%;
  height: 5rem;
  padding: 0 1rem;
  background-color: var(--theme-off-white);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.linkItems {
  position: fixed;
  right: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transform: translateY(-200%);
  transition: transform 0.3s ease-in-out;
  background-color: white;
  border-radius: 8px;
  z-index: 999;
  width: 50%;
  min-height: 70dvh;
  padding: 2rem;
}

.linkItems.expanded {
  transform: translateY(0);
}

.dashLink {
  text-decoration: none;
  color: var(--text-color);
  display: inline-block;
  width: fit-content;
}

.dashLink.router-link-exact-active {
  border-bottom: 2px solid black;
}

.verticalSpaced {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hamburger {
  width: 25px;
  cursor: pointer;
  top: 1rem;
  left: 1rem;
  z-index: 1000;
}

.hamburger span {
  display: block;
  height: 1px;
  background: var(--text-color);
  border-radius: 2px;
  transform-origin: center;
  transition:
    transform 0.2s ease,
    opacity 0.25s ease;
}

/* Position the bars */
.hamburger span:nth-child(1) {
  transform: translateY(-8px);
}

.hamburger span:nth-child(2) {
  transform: translateY(0);
}

.hamburger span:nth-child(3) {
  transform: translateY(8px);
}

/* OPEN STATE */
.hamburger.open span:nth-child(1) {
  transform: translateY(0) rotate(45deg);
}

.hamburger.open span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

.hamburger.open span:nth-child(3) {
  transform: translateY(0) rotate(-45deg);
}

@media (min-width: 768px) {
  .navBar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2rem;
  }

  .linkItems {
    width: auto;
    gap: 2rem;
  }

  /* .hamburger {
    width: 50px;
  } */
}

@media (min-width: 1024px) {
  .hamburger {
    display: none;
  }

  .linkItems {
    position: static;
    transform: none;
    flex-direction: row;
    background: transparent;
    padding: 0;
    gap: 2rem;
    min-height: auto;
  }

  .verticalSpaced {
    flex-direction: row;
    gap: 2rem;
  }

  .dashLink:hover {
    transform: scale(1.1);
  }
}
</style>
