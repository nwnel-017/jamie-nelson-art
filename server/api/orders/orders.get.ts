import { serverSupabaseClient } from "#supabase/server";
import { getOrders } from "@server/services/orders.service";

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  try {
    const supabase = await serverSupabaseClient(event);
    const data = await getOrders(supabase);
    return data;
  } catch {
    return createError({ statusCode: 500, statusMessage: "Internal Error" });
  }
});
