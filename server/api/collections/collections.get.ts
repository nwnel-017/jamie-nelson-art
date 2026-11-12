import { serverSupabaseClient } from "#supabase/server";
import { getCollections } from "@server/services/collections.service";

export default defineEventHandler(async (event) => {
  try {
    const supabase = await serverSupabaseClient(event);
    const data = await getCollections(supabase);
    return data;
  } catch {
    return createError({
      statusCode: 500,
      data: {
        message: "Internal Error",
      },
    });
  }
});
