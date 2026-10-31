import { serverSupabaseServiceRole } from "#supabase/server";
import { getProfile } from "@server/services/profile.service";

export default defineEventHandler(async (event) => {
  try {
    const supabase = serverSupabaseServiceRole(event);
    return await getProfile(supabase);
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to retrieve artist profile",
    });
  }
});
