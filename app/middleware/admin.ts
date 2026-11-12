// middleware/admin.ts

// To Do: fix issue
// when token is expired - there is a loop of continually sending an update token request
// when the serve side middleware retrieves the token - it is in a refresh loop and is expired
// supabase rate limit is reached from too many refresh token requests`

export default defineNuxtRouteMiddleware(async () => {
  // this route - if token is expired - the server should refresh it
  console.log("Running admin middleware");
  // const supabase = useSupabaseClient();
  // const user = useSupabaseUser(); // problem - this doesnt refresh the session - serverSupabaseUser() does

  const user = useSupabaseUser();

  if (user.value === null) {
    return navigateTo("/admin/login");
  }

  // problem with this method - it doesnt detect when there is no session - user isnt logged out
  // const session = useSupabaseSession();
  // console.log("admin middleware triggered");

  // if (!session || !session?.value) {
  //   navigateTo("/admin/login");
  // }
});
