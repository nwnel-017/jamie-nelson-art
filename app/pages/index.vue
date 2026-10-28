<script lang="ts" setup>
definePageMeta({ layout: "artist" });

useSeoMeta({
  title: "About Jamie Stambolie Nelson",
  description:
    "Meet Jamie Stambolie Nelson, a Zimbabwean mixed media artist based in San Juan, Puerto Rico. Discover her story and artistic practice.",
  ogTitle: "Jamie Stambolie Nelson",
  ogDescription:
    "Meet Jamie Stambolie Nelson, a Zimbabwean mixed media artist based in San Juan, Puerto Rico.",
});

const { getProfile } = useProfile();
const { data: profile } = await getProfile();
const portraitFailed = ref(false);

watch(() => profile.value?.imageUrl, () => { portraitFailed.value = false; });

const bioParagraphs = computed(() => {
  const bio = profile.value?.bio?.trim();
  return bio
    ? bio.split(/\n\s*\n/).filter(Boolean)
    : [
        "Jamie’s biography is coming soon.",
        "This space will share her story, the inspiration behind her work, and her artistic practice.",
      ];
});
</script>

<template>
  <section class="artistAbout" aria-labelledby="about-heading">
    <div class="portrait">
      <NuxtImg
        v-if="profile?.imageUrl && !portraitFailed"
        :src="profile.imageUrl"
        alt="Jamie Stambolie Nelson"
        class="portraitImage"
        sizes="100vw md:36vw lg:32vw"
        loading="eager"
        fetchpriority="high"
        @error="portraitFailed = true"
      />
      <div v-else class="portraitPlaceholder" role="img" aria-label="Artist portrait coming soon">
        <svg viewBox="0 0 240 300" aria-hidden="true">
          <circle cx="120" cy="95" r="49" />
          <path d="M28 290v-44a92 92 0 0 1 184 0v44Z" />
        </svg>
        <span>Artist portrait coming soon</span>
      </div>
    </div>
    <div class="biography">
      <h1 id="about-heading">About</h1>
      <p v-for="(paragraph, index) in bioParagraphs" :key="index">{{ paragraph }}</p>
    </div>
  </section>
</template>

<style scoped>
.artistAbout {
  width: min(88.5%, 120rem);
  margin: 0 auto;
  padding: 2.5rem 0 5rem;
  display: grid;
  gap: 2.5rem;
  align-items: start;
}

.portrait {
  width: 100%;
  max-width: 35rem;
}

.portraitImage,
.portraitPlaceholder {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
}

.portraitImage {
  object-fit: cover;
  object-position: center;
}

.portraitPlaceholder {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #415563;
  color: #e1e6e9;
}

.portraitPlaceholder svg {
  width: 75%;
  fill: #71818b;
}

.portraitPlaceholder span {
  position: absolute;
  bottom: 1.5rem;
  left: 1rem;
  right: 1rem;
  text-align: center;
  font-size: 1rem;
}

.biography {
  min-width: 0;
}

.biography h1 {
  margin: 0 0 1.75rem;
  color: var(--artist-gold);
  font-size: clamp(3rem, 3.8vw, 5rem);
  line-height: 1.1;
  font-weight: 700;
}

.biography p {
  margin: 0 0 1em;
  font-size: clamp(1.125rem, 1.65vw, 2.125rem);
  line-height: 1.2;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.biography p:last-child {
  margin-bottom: 0;
}

@media (min-width: 768px) {
  .artistAbout {
    grid-template-columns: minmax(0, 36.25%) minmax(0, 1fr);
    gap: 6.3vw;
    padding: 2.8vw 0 10vw;
  }

  .portrait {
    max-width: none;
    margin-top: 2vw;
  }

  .biography h1 {
    margin-bottom: 3vw;
  }
}
</style>
