import { addArtwork } from "@server/services/artworks.service";
import { validateNewArtworkForm } from "@utils/validation/form";
import { serverSupabaseClient } from "#supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { requireAdmin } from "@server/utils/auth/requireAdmin";
import type { UploadInput } from "~~/server/services/storage.service";
import type { ArtworkData } from "#types/artworks/artworks";
import { extractArtworkFormData } from "~~/server/utils/form/artworkForm";
import { validateImageFile } from "~~/utils/validation/image";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const form = await readMultipartFormData(event); // MultiPartData[]

  if (!form) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "No form data received",
      },
    });
  }

  const artworkForm: ArtworkData = extractArtworkFormData(form);

  console.log("collection id found in route: " + artworkForm.collection);

  const imageField = form.find((field) => field.name === "image");

  if (!artworkForm || !imageField) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid form!",
      },
    });
  }

  const validatedForm = await validateNewArtworkForm(artworkForm);
  if (!validatedForm.success) {
    // invalid form
    console.log("Invalid form!");
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid form!",
      },
    });
  }

  const image: UploadInput = {
    filename: imageField?.filename || "",
    buffer: imageField?.data || Buffer.from([]),
    size: imageField?.data ? imageField.data.length : 0,
    contentType: imageField?.type || "application/octet-stream",
  };

  // validate image
  if (await !validateImageFile(image)) {
    console.log("Invalid image file!");
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid image file!",
      },
    });
  }
  console.log("image validation passed");

  try {
    const supabase = (await serverSupabaseClient(
      event,
    )) as SupabaseClient<Database>;

    await addArtwork(supabase, artworkForm, image);
  } catch (err) {
    console.log("error adding artwork: " + err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create artwork!",
      data: {
        err,
      },
    });
  }

  return { success: true, message: "Artwork added successfully!" };
});
