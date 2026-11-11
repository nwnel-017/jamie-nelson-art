import { ArtworkData } from "~~/types/artworks/artworks";
import { MultiPartData } from "h3";

export const extractArtworkFormData = (form: MultiPartData[]) => {
  const artworkForm: ArtworkData = {
    title: form.find((field) => field.name === "title")?.data?.toString() || "",
    description:
      form.find((field) => field.name === "description")?.data?.toString() ||
      "",
    price: form.find((field) => field.name === "price")?.data?.toString() || "",
    dimensions:
      form.find((field) => field.name === "dimensions")?.data?.toString() || "",
    year: form.find((field) => field.name === "year")?.data?.toString() || "",
    medium:
      form.find((field) => field.name === "medium")?.data?.toString() || "",
    collection:
      form.find((field) => field.name === "collection")?.data?.toString() || "",
    artwork_note:
      form.find((field) => field.name === "artwork_note")?.data?.toString() ||
      "",
    cover_image:
      form.find((field) => field.name === "cover_image")?.data?.toString() ===
        "true" || false,
  };
  return artworkForm;
};
