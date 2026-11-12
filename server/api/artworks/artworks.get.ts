import { getArtworks } from "@server/services/artworks.service";
import { serverSupabaseClient } from "#supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";

export default defineEventHandler(async (event) => {
  console.log("retrieving artworks!");

  try {
    const supabase = (await serverSupabaseClient(
      event,
    )) as SupabaseClient<Database>;
    const data = await getArtworks(supabase);
    return data;
  } catch (err) {
    console.log("Error fetching artworks: " + err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch artworks",
      },
    });
  }
});
