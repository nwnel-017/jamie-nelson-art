import { serverSupabaseClient } from "#supabase/server";
import { deleteGalleryImage } from "~~/server/services/artworks.service";

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

  console.log("reached DELETE api call for gallery");

  try {
    const supabase = await serverSupabaseClient(event);

    await deleteGalleryImage(supabase, id);

    return { success: true, message: "Photo deleted successfully!" };
  } catch (err) {
    console.log("Failed to delete photo: " + err);
    throw createError({
      status: 500,
      data: {
        message: "Internal Error",
      },
    });
    // return { success: false, message: "Failed to delete Image" };
  }
});
