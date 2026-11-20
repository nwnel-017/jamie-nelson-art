// Simulate the identity supplied by the Canva host, not application auth logic.
export const auth = {
  getCanvaUserToken: async () =>
    `test.${btoa(JSON.stringify({ aud: "requirements-e2e", userId: "requirements-e2e", brandId: "test-team" })).replace(/=/g, "")}.signature`,
};
