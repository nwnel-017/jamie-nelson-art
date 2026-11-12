// import { getDashboardStats } from "../../utils/dashboard";
import { getDashboardStats } from "@server/services/dashboard.service";
import { getTotalFundsRaised } from "@server/services/orders.service";
import { serverSupabaseClient } from "#supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { requireAdmin } from "@server/utils/auth/requireAdmin";

// To Do: separate this into just using separate reusable util/ functions instead of getting all together
export default defineEventHandler(async (event) => {
  const supabase = (await serverSupabaseClient(
    event
  )) as SupabaseClient<Database>;

  // const { supabase, user } = await requireAdmin(event);
  await requireAdmin(event);

  const { artworkCount, soldArtworks, orderCount } = await getDashboardStats(supabase);

  // Get total funds raised from orders table
  const fundsRaised = await getTotalFundsRaised(supabase);

  console.log("Sold artworks: " + soldArtworks); // correct

  return {
    artworks: artworkCount || 0,
    soldArtworks: soldArtworks || 0,
    orders: orderCount || 0,
    fundsRaised: fundsRaised || 0,
  };
});
