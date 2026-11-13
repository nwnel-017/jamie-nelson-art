import { validateImageFile } from "~~/utils/validation/image";
import { addCoverImage } from "@server/services/artworks.service";
import { serverSupabaseClient } from "#supabase/server";
import type { UploadInput } from "@server/services/storage.service";

export default defineEventHandler(async (event) => {
  // 1.) Require authentication
  await requireAdmin(event);

  const formData = await readMultipartFormData(event);

  if (!formData || formData.length === 0) {
    throw new Error("No form data provided");
  }

  // 2.) Exctract image field
  const imageField = formData.find((field) => field.name === "image");

  if (!imageField) {
    console.log("Missing imageField in form");
    throw createError({
      statusCode: 400,
      data: {
        message: "Internal Error",
      },
    });
  }

  const image: UploadInput = {
    filename: imageField?.filename || "",
    buffer: imageField?.data || Buffer.from([]),
    size: imageField?.data ? imageField.data.length : 0,
    contentType: imageField?.type || "application/octet-stream",
  };

  if (await !validateImageFile(image)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid image!",
      },
    });
  }

  try {
    const supabase = await serverSupabaseClient(event);

    await addCoverImage(supabase, image);

    return { success: true, message: "Successfully Added Cover Image!" };
  } catch (err) {
    console.log("Something went wrong: " + err);
    throw createError({
      statusCode: 500,
      message: "Internal Error",
    });
  }
});
