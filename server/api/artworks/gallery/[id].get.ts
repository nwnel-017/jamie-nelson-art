import { serverSupabaseClient } from "#supabase/server";
import { getGalleryImages } from "@server/services/artworks.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";

export default defineEventHandler(async (event) => {
  console.log("hit gallery GET api route");

  const id = event.context.params?.id as string;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: { message: "Artwork ID is required" },
    });
  }

  try {
    const supabase = (await serverSupabaseClient(
      event,
    )) as SupabaseClient<Database>;

    const data = await getGalleryImages(supabase, id);
    return data;
  } catch (err) {
    console.log("Error getting gallery images: ", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Error retrieving gallery images",
        details: String(err),
      },
    });
  }
});
