<script lang="ts" setup>
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

useSeoMeta({
  title: "Admin Settings",
  robots: "noindex, nofollow",
});

const { getProfile, updateProfile } = useProfile();
const { data: profile, pending, error } = await getProfile();

const bio = ref(profile.value?.bio || "");
const image = ref<File | null>(null);
const previewUrl = ref(profile.value?.imageUrl || "");
const saving = ref(false);
let localPreviewUrl: string | null = null;

function selectImage(event: Event) {
  const input = event.target as HTMLInputElement;
  image.value = input.files?.[0] || null;

  if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  localPreviewUrl = image.value ? URL.createObjectURL(image.value) : null;
  previewUrl.value = localPreviewUrl || profile.value?.imageUrl || "";
}

async function saveProfile() {
  if (!bio.value.trim()) {
    toast.error("Bio text is required");
    return;
  }

  const form = new FormData();
  form.append("bio", bio.value);
  if (image.value) form.append("image", image.value);

  try {
    saving.value = true;
    const updated = await updateProfile(form);
    profile.value = updated;
    bio.value = updated.bio;
    previewUrl.value = updated.imageUrl || "";
    image.value = null;
    toast.success("Profile updated");
  } catch {
    toast.error("Failed to update profile");
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
});
</script>

<template>
  <div class="settingsPage verticalMargin">
    <h1>Profile Settings</h1>
    <p v-if="pending">Loading profile…</p>
    <p v-else-if="error">Unable to load the profile.</p>
    <form v-else class="profileForm" @submit.prevent="saveProfile">
      <div class="field">
        <label for="profile-image">Profile photo</label>
        <NuxtImg
          v-if="previewUrl"
          :src="previewUrl"
          alt="Profile photo preview"
          class="profilePreview"
        />
        <div v-else class="emptyPreview">No profile photo</div>
        <input
          id="profile-image"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          @change="selectImage"
        />
        <small>JPG, PNG, GIF, or WebP. Maximum 5 MB.</small>
      </div>

      <div class="field">
        <label for="bio">Bio</label>
        <textarea id="bio" v-model="bio" rows="18" maxlength="10000" />
      </div>

      <Button type="submit" :disabled="saving">
        {{ saving ? "Saving…" : "Save profile" }}
      </Button>
    </form>
  </div>
</template>

<style scoped>
.settingsPage {
  width: min(90%, 48rem);
}

.profileForm,
.field {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profileForm {
  gap: 1.5rem;
}

.field label {
  font-weight: bold;
}

.profilePreview,
.emptyPreview {
  width: min(100%, 20rem);
  aspect-ratio: 4 / 5;
  border-radius: 8px;
}

.profilePreview {
  object-fit: cover;
}

.emptyPreview {
  display: grid;
  place-items: center;
  border: 1px solid var(--theme-grey);
  color: var(--theme-grey);
}

textarea {
  width: 100%;
  min-height: 22rem;
  padding: 0.75rem;
  resize: vertical;
}

button {
  align-self: flex-start;
}
</style>
