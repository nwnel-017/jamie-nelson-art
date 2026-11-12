<script setup lang="ts">
import InstagramIcon from "./icons/InstagramIcon.vue";
defineOptions({ name: "SiteFooter" });
</script>

<template>
  <div class="footer">
    <div>
      <div>LOCATION</div>
      <div>San Juan, Puerto Rico</div>
    </div>
    <div>
      <div>WEBSITE DESIGN</div>
      <div>Nathan Nelson</div>
    </div>
    <div>
      <div>CONTACT</div>
      <div>
        jamiestambolie@gmail.com |
        <InstagramIcon size="sm" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.footer {
  margin-top: 1rem;
  font-size: 0.5rem;
  height: 10vh;
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0 1rem;
  align-items: center;
}

@media (min-width: 768px) {
  .footer {
    font-size: 0.8rem;
  }
}

@media (min-width: 1024px) {
  .footer {
    font-size: 0.9rem;
    padding: 0 2rem;
  }
}
</style>
