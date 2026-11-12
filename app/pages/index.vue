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
        sizes="89vw sm:58vw lg:32vw"
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
  width: min(88.5%, 72rem);
  margin: 0 auto;
  padding: 2.5rem 0 5rem;
  display: flow-root;
}

.portrait {
  width: 100%;
  margin: 0 0 2.5rem;
}

.portraitImage,
.portraitPlaceholder {
  display: block;
  width: 100%;
}

.portraitImage {
  height: auto;
}

.portraitPlaceholder {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  gap: 1.5rem;
  padding: 2rem;
  background: #415563;
  color: #e1e6e9;
}

.portraitPlaceholder svg {
  width: 60%;
  max-width: 12rem;
  fill: #71818b;
}

.portraitPlaceholder span {
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
  font-size: clamp(1.125rem, 1.3vw, 1.375rem);
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.biography p:last-child {
  margin-bottom: 0;
}

@media (min-width: 640px) {
  .portrait {
    width: 65%;
    margin-inline: auto;
  }
}

@media (min-width: 768px) {
  .artistAbout {
    padding: 2.8vw 0 10vw;
  }

  .biography h1 {
    margin-bottom: 3vw;
  }
}

@media (min-width: 1024px) {
  .artistAbout {
    width: min(88.5%, 120rem);
    display: grid;
    grid-template-columns: minmax(0, 36.25%) minmax(0, 1fr);
    gap: 6.3vw;
    align-items: start;
  }

  .portrait {
    width: 100%;
    margin: 2vw 0 0;
  }
}
</style>
