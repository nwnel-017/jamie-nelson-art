import { requireAdmin } from "@server/utils/auth/requireAdmin";
import { deleteArtwork } from "@server/services/artworks.service";
import { serverSupabaseClient } from "#supabase/server";

export default defineEventHandler(async (event) => {
  console.log("deleting artwork!");

  await requireAdmin(event);

  const id = event.context.params?.id as string;

  try {
    const supabase = await serverSupabaseClient(event);
    await deleteArtwork(supabase, id);
    return { success: true };
  } catch (err) {
    console.log("Error occured deleting artwork: " + err);
    throw new Error("Failed to delete artwork!", { cause: err });
  }
});
