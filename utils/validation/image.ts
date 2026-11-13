import type { UploadInput } from "~~/server/services/storage.service";

export async function validateImageFile(file?: UploadInput | null) {
  if (!file) {
    return false;
  }

  const type = file.contentType;
  if (
    !type ||
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(type)
  ) {
    return false;
  }

  // Check file size
  const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
  if (file?.size && file.size > maxSizeInBytes) {
    return false;
  }

  return true;
}
