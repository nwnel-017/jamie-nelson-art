import { addGalleryImages } from "@server/services/artworks.service";
import { serverSupabaseClient } from "#supabase/server";
import type { UploadInput } from "@server/services/storage.service";
import { validateImageFile } from "~~/utils/validation/image";
import { validateUUID } from "@utils/validation/other";

export default defineEventHandler(async (event) => {
  console.log("Received request to upload gallery images!");

  // 1.) Require authentication
  await requireAdmin(event);

  const formData = await readMultipartFormData(event);

  if (!formData || formData.length === 0) {
    throw new Error("No form data provided");
  }

  // 2.) Exctract image field
  const artworkIdField = formData.find((field) => field.name === "artworkId");
  const artworkId = artworkIdField?.data.toString() || "";
  const imageField = formData.filter((field) => field.name === "image");

  if (!artworkId || !imageField) {
    console.log("Missing artworkId or imageField in form");
    throw createError({
      statusCode: 400,
      data: {
        message: "Internal Error",
      },
    });
  }

  const validatedUUID = validateUUID(artworkId);
  if (!validatedUUID.success) {
    console.log("Invalid artworkId UUID");
    throw createError({
      statusCode: 400,
      message: "Bad Request",
      data: {
        message: "Invalid artwork ID format",
      },
    });
  }

  const images: UploadInput[] = [];

  for (const img of imageField) {
    const image: UploadInput = {
      filename: img?.filename || "",
      buffer: img?.data || Buffer.from([]),
      size: img?.data ? img.data.length : 0,
      contentType: img?.type || "application/octet-stream",
    };

    if (await !validateImageFile(image)) {
      console.log("Invalid gallery image");
      throw createError({
        statusCode: 400,
        message: "Bad Request",
        data: {
          message: "Invalid image file!",
        },
      });
    }

    images.push(image);
  }

  try {
    const supabase = await serverSupabaseClient(event);

    await addGalleryImages(supabase, artworkId, images);

    return { success: true, message: "Successfully Added Gallery Photos!" };
  } catch (err) {
    console.log("Something went wrong: " + err);
    throw createError({
      statusCode: 500,
      message: "Internal Error",
    });
  }
});
