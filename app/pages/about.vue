<script lang="ts" setup>
definePageMeta({
  layout: "default",
});

useSeoMeta({
  title: "About Jamie Nelson",
  description:
    "Learn about Jamie Nelson, a Zimbabwean mixed media artist whose work explores beauty, resilience, memory, and hope.",
  ogTitle: "About Jamie Nelson",
  ogDescription:
    "Learn about Jamie Nelson, a Zimbabwean mixed media artist whose work explores beauty, resilience, memory, and hope.",
});

const { getProfile } = useProfile();
const { data: profile, pending, error } = await getProfile();

const bioParagraphs = computed(() =>
  profile.value?.bio.split(/\n\s*\n/).filter(Boolean) || [],
);
</script>

<template>
  <div class="verticalContent">
    <h1>About</h1>
    <p v-if="pending">Loading profile…</p>
    <p v-else-if="error || !profile">Biography unavailable.</p>
    <div v-else class="aboutContent">
      <NuxtImg
        v-if="profile.imageUrl"
        :src="profile.imageUrl"
        alt="Jamie Nelson"
        class="profileImage"
        sizes="100vw sm:320px md:400px"
      />
      <div class="aboutText">
        <p v-for="(paragraph, index) in bioParagraphs" :key="index">
          {{ paragraph }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aboutContent {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 90%;
  margin: 0 auto;
}

.aboutText p {
  white-space: pre-line;
}

.profileImage {
  width: 100%;
  max-height: 32rem;
  object-fit: cover;
  border-radius: 8px;
}

@media (min-width: 768px) {
  .aboutContent {
    width: 80%;
    flex-direction: row;
    align-items: flex-start;
  }

  .profileImage,
  .aboutText {
    width: 50%;
  }
}
</style>
