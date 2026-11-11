import { serverSupabaseServiceRole } from "#supabase/server";
import { updateProfile } from "@server/services/profile.service";
import { requireAdmin } from "@server/utils/auth/requireAdmin";
import type { UploadInput } from "@server/services/storage.service";
import { validateImageFile } from "@utils/validation/image";
import { profileSchema } from "@utils/validation/schemas/profile";
import { fileTypeFromBuffer } from "file-type";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const form = await readMultipartFormData(event);
  const bio = form?.find((field) => field.name === "bio")?.data.toString();
  const parsed = profileSchema.safeParse({ bio });

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid bio is required",
    });
  }

  const imageField = form?.find(
    (field) => field.name === "image" && field.filename,
  );
  let image: UploadInput | undefined;

  if (imageField) {
    image = {
      filename: imageField.filename || "profile.jpg",
      buffer: imageField.data,
      size: imageField.data.length,
      contentType: imageField.type || "application/octet-stream",
    };

    const detectedType = await fileTypeFromBuffer(image.buffer);
    if (
      !(await validateImageFile(image)) ||
      !detectedType ||
      detectedType.mime !== image.contentType
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "The profile image must be a JPG, PNG, GIF, or WebP under 5 MB",
      });
    }
  }

  try {
    const supabase = serverSupabaseServiceRole(event);
    return await updateProfile(supabase, parsed.data.bio, image);
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update artist profile",
    });
  }
});
