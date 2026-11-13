import type { H3Event } from "h3";
import { serverSupabaseUser } from "#supabase/server";

export async function requireAdmin(event: H3Event) {
  const user = await serverSupabaseUser(event);
  if (!user) {
    console.log("user not found in server!");
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      data: {
        message: "User not authenticated",
      },
    });
  }

  // To Do: check admin email
  const config = useRuntimeConfig();
  if (user.email !== config.public.admin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden",
      data: { message: "User is not admin" },
    });
  }

  return user;
}
