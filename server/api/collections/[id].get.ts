import { getCollectionArtworks } from "@server/services/artworks.service";
import { serverSupabaseClient } from "#supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";

export default defineEventHandler(async (event) => {
  console.log("retrieving artworks!");

  const id = event.context?.params?.id;

  if (!id) {
    console.log("Missing collection ID");
    return createError({
      statusCode: 400,
      message: "Bad Request",
      data: {
        message: "Missing collection ID",
      },
    });
  }

  try {
    const supabase = (await serverSupabaseClient(
      event,
    )) as SupabaseClient<Database>;
    const data = await getCollectionArtworks(supabase, id);
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
