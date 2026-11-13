import { requireAdmin } from "@server/utils/auth/requireAdmin";
import { serverSupabaseClient } from "#supabase/server";
import { createCollection } from "@server/services/collections.service";
import { validateCollectionName } from "~~/utils/validation/other";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody(event);
  const { name } = body;

  if (!name) {
    console.log("Missing parameters");
    return createError({
      statusCode: 400,
      data: {
        message: "Bad request",
      },
    });
  }

  const validateName = validateCollectionName(name);
  if (!validateName.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid collection name!",
      },
    });
  }
  try {
    const supabase = await serverSupabaseClient(event);
    await createCollection(supabase, validateName.data);
    return { success: true, message: "Collection created" };
  } catch (err) {
    console.log("Internal Error: " + err);
    return createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Something went wrong",
      },
    });
  }
});
