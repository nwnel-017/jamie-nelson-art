<script lang="ts" setup>
import Instagram from "~/assets/icons/instagram.svg";

definePageMeta({ layout: "artist" });

useSeoMeta({
  title: "Contact",
  description:
    "Get in touch with Jamie Nelson for artwork questions, purchase inquiries, and general contact information.",
  ogTitle: "Contact Jamie Nelson Art",
  ogDescription:
    "Get in touch with Jamie Nelson for artwork questions, purchase inquiries, and general contact information.",
});
</script>

<template>
  <section class="artistPage artistContact" aria-labelledby="contact-heading">
    <h1 id="contact-heading" class="artistHeading">Contact</h1>
    <div class="contactDetails">
      <p>
        For commissions, collaborations, &amp; other general enquiries:
        <a class="emailLink" href="mailto:jamiestambolie@gmail.com">jamiestambolie@gmail.com</a>
      </p>
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
  </section>
</template>

<style scoped>
.artistContact {
  min-height: 100%;
  display: grid;
  gap: 4rem;
  justify-items: center;
  text-align: center;
}

.artistContact h1 {
  margin: 0;
}

.contactDetails {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.75em;
  font-size: var(--artist-body-size);
  line-height: 1.2;
}

.contactDetails p {
  margin: 0;
}

.contactDetails a {
  color: inherit;
  text-decoration: none;
}

.contactDetails a:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.contactDetails a:focus-visible {
  outline: 2px solid var(--artist-gold);
  outline-offset: 5px;
}

.emailLink {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.instagramLink {
  display: inline-flex;
}

.instagramLink svg {
  width: 2.2em;
  height: 2.2em;
  fill: currentColor;
}

@media (min-width: 768px) {
  .artistContact {
    grid-template-rows: 1fr auto 1fr;
    gap: 0;
    --artist-page-padding: 2.8vw 0;
  }

  .artistContact h1 {
    align-self: start;
  }
}
</style>
