import type { DashboardStats } from "#types/dashboard/dashboardStats";

// To Do: Change to have sold artwork count instead of posts
export function useDashboard() {
  const getStats = async () =>
    useFetch<DashboardStats>("/api/dashboard/dashboard", {
      transform: (stats) => ({
        artworks: stats?.artworks ?? 0,
        soldArtworks: stats?.soldArtworks ?? 0,
        orders: stats?.orders ?? 0,
        fundsRaised: stats?.fundsRaised ?? 0,
      }),
      credentials: "include",
      lazy: true,
    });

  return { getStats };
}
