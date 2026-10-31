<script setup lang="ts">
import Instagram from "~/assets/icons/instagram.svg";

const menuOpen = ref(false);
const route = useRoute();
watch(() => route.fullPath, () => { menuOpen.value = false; });
</script>

<template>
  <div class="artistSite">
    <a class="skipLink" href="#home-content">Skip to content</a>
    <header class="siteHeader" @keydown.esc="menuOpen = false">
      <NuxtLink class="artistName" to="/" @click="menuOpen = false">
        JAMIE STAMBOLIE NELSON
      </NuxtLink>
      <button
        class="menuToggle"
        type="button"
        aria-controls="artist-navigation"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? "Close" : "Menu" }}
      </button>
      <nav
        id="artist-navigation"
        class="siteNav"
        :class="{ isOpen: menuOpen }"
        aria-label="Main navigation"
      >
        <NuxtLink to="/" @click="menuOpen = false">ABOUT</NuxtLink>
        <NuxtLink to="/artworks/gallery" @click="menuOpen = false">PORTFOLIO</NuxtLink>
        <NuxtLink to="/exhibitions" @click="menuOpen = false">EXHIBITIONS &amp; PROJECTS</NuxtLink>
        <NuxtLink to="/shop" @click="menuOpen = false">SHOP</NuxtLink>
        <NuxtLink to="/contact" @click="menuOpen = false">CONTACT</NuxtLink>
      </nav>
    </header>

    <main id="home-content" class="siteContent" tabindex="0">
      <slot />
    </main>

    <footer class="siteFooter">
      <div>
        <p class="footerLabel">LOCATION</p>
        <p>San Juan, Puerto Rico</p>
      </div>
      <div>
        <p class="footerLabel">WEBSITE DESIGN</p>
        <p>Nathan Nelson</p>
      </div>
      <div>
        <p class="footerLabel">CONTACT</p>
        <div class="contactLinks">
          <a href="mailto:jamiestambolie@gmail.com">jamiestambolie@gmail.com</a>
          <a
            class="instagramLink"
            href="https://www.instagram.com/jamienelsonart/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Jamie Nelson Art on Instagram (opens in a new tab)"
          >
            <Instagram aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.artistSite {
  --artist-gold: #e8ac50;
  --artist-blue: #2d4050;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  font-family: Arial, Helvetica, sans-serif;
  color: #111;
  background: white;
}

.artistSite a {
  color: inherit;
  text-decoration: none;
}

.artistSite a:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.artistSite :focus-visible {
  outline: 2px solid var(--artist-gold);
  outline-offset: 5px;
}

.siteHeader {
  position: relative;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
  background: white;
}

.siteHeader .artistName {
  color: var(--artist-gold);
  font-size: clamp(1rem, 1.65vw, 2.125rem);
  font-weight: 700;
  line-height: 1.2;
}

.menuToggle {
  padding: 0.5rem;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.siteNav {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  display: none;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.25rem;
  padding: 1rem 1.5rem 1.5rem;
  background: white;
  box-shadow: 0 0.5rem 1rem rgb(0 0 0 / 10%);
  font-size: 1rem;
  line-height: 1.2;
  z-index: 1;
}

.siteNav.isOpen {
  display: flex;
}

.siteContent {
  flex: 1;
  min-width: 0;
  background: var(--artist-blue);
  color: #fff;
}

.siteFooter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.75rem 2rem;
  padding: 1.75rem 1.5rem;
  background: white;
  font-size: clamp(1rem, 1.55vw, 2rem);
  line-height: 1.1;
}

.siteFooter p {
  margin: 0;
}

.footerLabel {
  color: var(--artist-gold);
  font-weight: 700;
}

.contactLinks {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.contactLinks > a:first-child {
  overflow-wrap: anywhere;
}

.instagramLink {
  display: inline-flex;
  flex: 0 0 auto;
}

.instagramLink svg {
  width: 1.35em;
  height: 1.35em;
}

.visuallyHidden,
.skipLink:not(:focus) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.skipLink:focus {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 21;
  padding: 1rem;
  background: white;
}

@media (min-width: 768px) {
  .artistSite {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .siteHeader,
  .siteFooter {
    min-height: clamp(5rem, 6.4vw, 8.25rem);
    padding: 1.25rem 2.5vw;
  }

  .siteContent {
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
}

@media (min-width: 1100px) {
  .siteHeader {
    flex-wrap: nowrap;
  }

  .menuToggle {
    display: none;
  }

  .siteNav {
    position: static;
    display: flex;
    flex-basis: auto;
    flex-direction: row;
    align-items: center;
    gap: clamp(1rem, 2.4vw, 3rem);
    padding: 0;
    background: transparent;
    box-shadow: none;
    font-size: clamp(1rem, 1.55vw, 2rem);
    white-space: nowrap;
  }
}
</style>
