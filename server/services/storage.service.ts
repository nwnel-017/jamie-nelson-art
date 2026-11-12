import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";

export type UploadInput = {
  filename: string;
  buffer: Buffer;
  size?: number;
  contentType?: string;
};

async function uploadFile(
  supabase: SupabaseClient<Database>,
  input: UploadInput,
  bucket: string,
) {
  console.log("uploading file!");

  if (!supabase || !input || !bucket) {
    throw createError({
      statusCode: 500,
      statusMessage: "Missing parameters",
    });
  }

  const { buffer, filename, contentType } = input;

  console.log(
    "uploading file with name:",
    filename,
    " and content type:",
    contentType,
  );

  const blob = new Blob([new Uint8Array(buffer)], {
    type: contentType || "application/octet-stream",
  });

  console.log("uploading image into bucket: " + bucket);
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filename, blob, {
      contentType: contentType,
      upsert: false,
    });

  if (error) {
    console.error("Supabase storage upload error:", error);
    throw error;
  }

  // Get public URL
  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filename);

  return {
    path: data?.path ?? filename,
    publicUrl: publicData?.publicUrl ?? null,
  };
}

async function deleteFile(
  supabase: SupabaseClient<Database>,
  filePath: string,
  bucket: string,
) {
  if (!supabase || !filePath || !bucket) {
    throw new Error("Missing parameters for deleteFile");
  }

  console.log("deleting file:", filePath + " from bucket:", bucket);
  const { error, data: deleted } = await supabase.storage
    .from(bucket)
    .remove([filePath]);
  if (error) {
    console.error("Supabase storage delete error:", error);
    throw error;
  }
  console.log("file deleted successfully: " + deleted);
}

export { uploadFile, deleteFile };
