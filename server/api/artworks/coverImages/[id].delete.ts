import { serverSupabaseClient } from "#supabase/server";
import { deleteCoverImage } from "~~/server/services/artworks.service";
import { requireAdmin } from "@server/utils/auth/requireAdmin";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = event.context.params?.id as string;

  if (!id) {
    console.log("Missing ID!");
    throw createError({
      status: 400,
      data: {
        message: "Bad Request!",
      },
    });
  }

  console.log("reached DELETE api call for cover image");

  try {
    const supabase = await serverSupabaseClient(event);

    await deleteCoverImage(supabase, id);
  } catch (err) {
    console.log("Failed to delete cover image: " + err);
    throw createError({
      status: 500,
      data: {
        message: "Internal Error",
      },
    });
  }
});
