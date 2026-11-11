import type { ArtworkRow } from "~~/types/supabase/tables";
// import { useLoadingStore } from "~/stores/loading";

const { startLoading, stopLoading } = useLoading();

export function useArtworks() {
  const getArtworks = async () => {
    return useFetch<ArtworkRow[]>("/api/artworks/artworks", { lazy: true });
  };

  const getArtwork = async (id: string) => {
    return useFetch<ArtworkRow>(`/api/artworks/${id}`, {
      lazy: true,
    });
  };

  const updateArtwork = async (id: string, form: FormData) => {
    return $fetch(`/api/artworks/${id}`, {
      method: "PUT",
      body: form,
    });
  };

  const addArtwork = async (
    title: string,
    description: string,
    image: File | null,
    dimensions: string,
    price: string,
    collection: string,
    artwork_note: string,
    cover_image: boolean,
    year = "",
    medium = "",
  ) => {
    // Validation
    if (
      !title ||
      !description ||
      !image ||
      !price ||
      !dimensions ||
      !collection
    ) {
      return {
        success: false,
        message: "Please enter all fields!",
      };
    }

    // Create FormData
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("price", price);
    formData.append("dimensions", dimensions);
    formData.append("image", image);
    formData.append("collection", collection);
    formData.append("cover_image", cover_image.toString());

    if (artwork_note) {
      formData.append("artwork_note", artwork_note);
    }

    if (year) {
      formData.append("year", year);
    }

    if (medium) {
      formData.append("medium", medium);
    }

    try {
      startLoading();
      console.log("Submitting artwork...");
      const response = await fetch("/api/artworks/artwork", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result?.message || "Failed to submit artwork!",
        };
      }

      return {
        success: true,
        message: "Submitted artwork successfully!",
        data: result,
      };
    } catch (err) {
      console.error(err);
      return {
        success: false,
        message: "An error occurred! Please try again!",
      };
    } finally {
      stopLoading();
      // loadingStore.stopLoading();
    }
  };

  const removeArtwork = async (id: string) => {
    return $fetch(`/api/artworks/${id}`, {
      method: "DELETE",
    });
  };

  const addArtworkImages = async (artworkId: string, form: FormData) => {
    console.log("Submitting artwork images...");
    return await $fetch("/api/artworks/gallery/gallery", {
      method: "POST",
      body: form,
    });
  };

  const addCoverImage = async (form: FormData) => {
    console.log("Submitting artwork images...");
    return await $fetch("/api/artworks/coverImages/coverImage", {
      method: "POST",
      body: form,
    });
  };

  const removeCoverImage = async (id: number) => {
    return await $fetch(`/api/artworks/coverImages/${id}`, {
      method: "DELETE",
    });
  };

  return {
    getArtworks,
    getArtwork,
    updateArtwork,
    addArtwork,
    removeArtwork,
    addArtworkImages,
    addCoverImage,
    removeCoverImage,
  };
}
