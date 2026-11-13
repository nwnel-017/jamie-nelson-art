<script lang="ts" setup>
const supabase = useSupabaseClient();
const { startLoading, stopLoading } = useLoading();

const isOpen = ref(false);

const toggleNav = () => {
  isOpen.value = !isOpen.value;
};

const logout = async () => {
  try {
    startLoading();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error.message);
      return;
    }

    await navigateTo("/admin/login");
  } catch (err) {
    console.error("Unexpected logout error:", err);
  } finally {
    stopLoading();
  }
};
</script>

<template>
  <div>
    <div class="hamburger" @click="toggleNav">
      <span />
      <span />
      <span />
    </div>
    <div class="navBarInternal" :class="{ open: isOpen }">
      <button class="exitBtn" @click="toggleNav">x</button>
      <NuxtLink to="/admin/dashboard" class="dashLink" @click="toggleNav"
        >Dashboard</NuxtLink
      >
      <NuxtLink to="/admin/orders" class="dashLink" @click="toggleNav"
        >Orders</NuxtLink
      >
      <NuxtLink to="/admin/artworks" class="dashLink" @click="toggleNav"
        >Artworks</NuxtLink
      >
      <NuxtLink
        to="/admin/collections/collections"
        class="dashLink"
        @click="toggleNav"
        >Collections</NuxtLink
      >
      <NuxtLink to="/admin/coverImages" class="dashLink" @click="toggleNav"
        >Cover Images</NuxtLink
      >
      <NuxtLink to="/admin/settings" class="dashLink" @click="toggleNav"
        >Settings</NuxtLink
      >
      <NuxtLink class="dashLink" @click="logout">Logout</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.navBarInternal {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: center;
  /* align-items: center; */
  gap: 1.5rem;
  height: 100vh;
  width: 40vw;
  left: 0;
  padding-left: 1rem;
  background-color: white;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
  transform: translateX(-100%);
  transition: transform 0.3s ease-in-out;
}

.navBarInternal.open {
  transform: translateX(0);
}

.dashLink {
  text-decoration: none;
  font-weight: bold;
  color: var(--text-color);
  display: inline-block;
  width: fit-content;
}

.dashLink.router-link-exact-active {
  border-bottom: 2px solid black;
}

.hamburger {
  width: 25px;
  cursor: pointer;
  position: fixed;
  top: 1rem;
  left: 1rem;
}

.hamburger span {
  display: block;
  height: 1px;
  margin: 5px 0;
  background: var(--text-color);
  border-radius: 1px;
}

.exitBtn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
}

@media (min-width: 768px) {
  .navBarInternal {
    width: 20vw;
    padding-left: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .navBarInternal {
    width: 15vw;
    padding-left: 2rem;
    transform: translate(0%);
  }

  .hamburger span {
    display: none;
  }

  .hamburger {
    display: none;
  }

  .navBarInternal {
    display: flex;
    /* justify-content: space-evenly; */
    gap: 2rem;
  }
}
</style>
