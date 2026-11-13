import { serverSupabaseClient } from "#supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { getLatestArtwork } from "@server/services/artworks.service";

export default defineEventHandler(async (event) => {
  console.log("retrieving latest artwork!");

  try {
    const supabase = (await serverSupabaseClient(
      event,
    )) as SupabaseClient<Database>;

    const artwork = await getLatestArtwork(supabase);

    return artwork;
  } catch (err) {
    console.log("Error fetching latest artwork: " + err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch latest artwork",
      },
    });
  }
});
