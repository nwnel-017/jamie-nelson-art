import { auth } from "@canva/user";
import { getDesignToken } from "@canva/design";
import {
  workflowStorageKey,
  saveWorkflow,
  loadWorkflow,
  clearWorkflow,
  designIdFromToken,
  selectedDesignId,
} from "./workflow_storage";
import { designRequest } from "./test_fixtures";

const jwt = (claims: object) =>
  `header.${btoa(JSON.stringify(claims))}.signature`;
function identity(userId = "user", brandId = "team") {
  jest
    .mocked(auth.getCanvaUserToken)
    .mockResolvedValue(
      jwt({ aud: "app", userId, brandId }) as Awaited<
        ReturnType<typeof auth.getCanvaUserToken>
      >,
    );
}

beforeEach(() => {
  jest.mocked(getDesignToken).mockClear();
  jest
    .mocked(getDesignToken)
    .mockRejectedValue(
      new Error(
        "no access to any role required by api 'designinteraction.getdesigntoken'",
      ),
    );
});

test("cache keys isolate users, teams, designs and backends without storing tokens", async () => {
  identity();
  const key = await workflowStorageKey("https://portfolio.example/", "design");
  expect(key).toBe(
    await workflowStorageKey("https://portfolio.example", "design"),
  );
  expect(key).not.toContain("signature");
  saveWorkflow(key, {
    instructions: designRequest.instructions,
    changeOptions: ["existing_pages"],
    analysis: designRequest,
  });
  expect(loadWorkflow(key)?.analysis?.id).toBe(designRequest.id);
  identity("another-user");
  expect(
    loadWorkflow(
      await workflowStorageKey("https://portfolio.example", "design"),
    ),
  ).toBeUndefined();
  identity();
  expect(
    loadWorkflow(
      await workflowStorageKey("https://portfolio.example", "another-design"),
    ),
  ).toBeUndefined();
  identity("user", "another-team");
  expect(
    loadWorkflow(
      await workflowStorageKey("https://portfolio.example", "design"),
    ),
  ).toBeUndefined();
  identity();
  expect(
    loadWorkflow(await workflowStorageKey("https://another.example", "design")),
  ).toBeUndefined();
  clearWorkflow(key);
  expect(loadWorkflow(key)).toBeUndefined();
});

test("blocked storage retains the active session in memory", () => {
  const key = "blocked-storage";
  const state = {
    instructions: "Update gallery",
    changeOptions: ["existing_pages"] as const,
  };
  const blocked = jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage blocked");
    });
  saveWorkflow(key, { ...state, changeOptions: [...state.changeOptions] });
  expect(loadWorkflow(key)?.instructions).toBe(state.instructions);
  blocked.mockRestore();
  clearWorkflow(key);
});

test("missing identity and malformed saved state fall back to the initial form", async () => {
  jest
    .mocked(auth.getCanvaUserToken)
    .mockRejectedValueOnce(new Error("Unavailable"));
  expect(
    await workflowStorageKey("https://portfolio.example", "design"),
  ).toBeUndefined();
  localStorage.setItem("corrupt", "not json");
  expect(loadWorkflow("corrupt")).toBeUndefined();
  clearWorkflow("corrupt");
});

test("publisher metadata scopes storage without calling the forbidden editor API", async () => {
  identity();
  const token = jwt({ designId: "publisher-design" });
  const outputType = {
    id: "portfolio",
    displayName: "Portfolio",
    mediaSlots: [
      {
        id: "media",
        displayName: "Media",
        accepts: { image: { format: "png" as const } },
        selection: [
          {
            kind: "image" as const,
            selectionMetadata: [
              { type: "design" as const, designToken: token, title: "Artwork" },
            ],
          },
        ],
      },
    ],
  };
  const id = selectedDesignId(outputType);
  expect(id).toBe("publisher-design");
  const key = await workflowStorageKey("https://portfolio.example", id);
  expect(key).toContain("publisher-design");
  expect(designIdFromToken(token)).toBe(id);
  expect(jest.mocked(getDesignToken)).not.toHaveBeenCalled();
});

test("missing publisher metadata disables caching without an unscoped fallback", async () => {
  identity();
  expect(await workflowStorageKey("https://portfolio.example")).toBeUndefined();
  expect(selectedDesignId()).toBeUndefined();
  expect(designIdFromToken("invalid-token")).toBeUndefined();
  expect(jest.mocked(getDesignToken)).not.toHaveBeenCalled();
});
