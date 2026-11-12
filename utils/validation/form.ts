import type { MultiPartData } from "h3";
import type { ArtworkData } from "#types/artworks/artworks";
import {
  artworkFormSchema,
  existingArtworkFormSchema,
} from "./schemas/artwork";

export const validateNewArtworkForm = async (form: ArtworkData) => {
  if (!form) {
    console.log("No form data received!");
    return { success: false, message: "No form data received" };
  }

  const parsed = artworkFormSchema.safeParse(form);

  return parsed;
};

export const validateExistingArtworkForm = async (form: MultiPartData[]) => {
  console.log("safe parsing artwork form...");

  // Extract fields from multipart array into object
  const id = form.find((field) => field.name === "id")?.data?.toString() || "";
  const title =
    form.find((field) => field.name === "title")?.data?.toString() || "";
  const description =
    form.find((field) => field.name === "description")?.data?.toString() || "";
  const price =
    form.find((field) => field.name === "price")?.data?.toString() || "";
  const imageField = form.find((field) => field.name === "image");
  const dimensions =
    form.find((field) => field.name === "dimensions")?.data?.toString() || "";

  // Convert to File object
  let image: File | undefined = undefined;
  if (imageField && imageField.data) {
    image = imageField
      ? new File(
          [new Uint8Array(imageField.data)],
          imageField.filename || "image",
          { type: imageField.type },
        )
      : new File([], "");
  }

  const formData = {
    id,
    title,
    description,
    price,
    dimensions,
    image,
  };
  const parsed = existingArtworkFormSchema.safeParse(formData);

  if (!parsed.success) {
    console.log("Artwork form validation failed:", parsed.error);
    return parsed;
  }

  return parsed;
};
