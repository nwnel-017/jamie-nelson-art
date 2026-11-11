import { requireAdmin } from "@server/utils/auth/requireAdmin";
import { updateArtwork } from "@server/services/artworks.service";
import { serverSupabaseClient } from "#supabase/server";
import { validateNewArtworkForm } from "@utils/validation/form";
import type { ArtworkData } from "#types/artworks/artworks";
import type { UploadInput } from "#types/files/files";
import { extractArtworkFormData } from "~~/server/utils/form/artworkForm";

export default defineEventHandler(async (event) => {
  console.log("updating artwork!");

  await requireAdmin(event);

  const supabase = await serverSupabaseClient(event);
  const form = await readMultipartFormData(event);
  if (!form || form.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "No form data provided",
      },
    });
  }

  // get parameters
  const id = form.find((field) => field.name === "id")?.data?.toString();
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
    });
  }

  const artworkForm: ArtworkData = {
    title: form.find((field) => field.name === "title")?.data?.toString() || "",
    description:
      form.find((field) => field.name === "description")?.data?.toString() ||
      "",
    dimensions:
      form.find((field) => field.name === "dimensions")?.data?.toString() || "",
    year: form.find((field) => field.name === "year")?.data?.toString() || "",
    medium:
      form.find((field) => field.name === "medium")?.data?.toString() || "",
    price: form.find((field) => field.name === "price")?.data?.toString() || "",
    collection:
      form.find((field) => field.name === "collection")?.data?.toString() || "",
    artwork_note:
      form.find((field) => field.name === "artwork_note")?.data?.toString() ||
      "",
    cover_image:
      form.find((field) => field.name === "cover_image")?.data?.toString() ===
        "true" || false,
  };

  const validatedForm = await validateNewArtworkForm(artworkForm);
  if (!validatedForm.success) {
    console.log("Invalid form: " + JSON.stringify(validatedForm));
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid form!",
      },
    });
  }
  try {
    await updateArtwork(supabase, id, artworkForm);
    return { success: true };
  } catch (err) {
    console.log("error updating artwork: " + err);
    throw new Error("Failed to update artist!");
  }
});
