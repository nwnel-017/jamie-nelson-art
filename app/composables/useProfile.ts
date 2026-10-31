import type { ArtistProfile } from "#types/profile/profile";

export function useProfile() {
  const getProfile = () => useFetch<ArtistProfile>("/api/profile");

  const updateProfile = (form: FormData) =>
    $fetch<ArtistProfile>("/api/profile", {
      method: "PUT",
      body: form,
    });

  return { getProfile, updateProfile };
}
