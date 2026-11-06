import { auth } from "@canva/user";
import { getDesignToken } from "@canva/design";
import type {
  OutputType,
  RenderSettingsUiRequest,
} from "@canva/intents/content";
import { act, screen, waitFor } from "@testing-library/react";
import { renderInTestProvider } from "src/utils/test_render";
import { SettingsUi } from "./settings_ui";
import { publishToPortfolio } from "./publish";
import {
  clearWorkflow,
  loadWorkflow,
  workflowStorageKey,
} from "./workflow_storage";
import { designRequest } from "./test_fixtures";

const jwt = (claims: object) =>
  `header.${btoa(JSON.stringify(claims))}.signature`;

test("publisher restores POST results without access to designinteraction.getdesigntoken", async () => {
  const designToken = jwt({ designId: "publisher-permissions-design" });
  jest
    .mocked(auth.getCanvaUserToken)
    .mockResolvedValue(
      jwt({ userId: "publisher-user", brandId: "team", aud: "app" }) as Awaited<
        ReturnType<typeof auth.getCanvaUserToken>
      >,
    );
  jest.mocked(getDesignToken).mockClear();
  jest
    .mocked(getDesignToken)
    .mockRejectedValue(
      new Error(
        "no access to any role required by api 'designinteraction.getdesigntoken'",
      ),
    );
  const key = await workflowStorageKey(
    "https://portfolio.example",
    "publisher-permissions-design",
  );
  clearWorkflow(key);
  const outputType: OutputType = {
    id: "portfolio",
    displayName: "Portfolio",
    mediaSlots: [
      {
        id: "media",
        displayName: "Media",
        accepts: { image: { format: "png" } },
        selection: [
          {
            kind: "image",
            selectionMetadata: [
              { type: "design", designToken, title: "Artwork" },
            ],
          },
        ],
      },
    ],
  };
  let publishRef = JSON.stringify({
    instructions: designRequest.instructions,
    changeOptions: ["existing_pages"],
  });
  let onContextChange:
    | Parameters<
        RenderSettingsUiRequest["registerOnContextChange"]
      >[0]["onContextChange"]
    | undefined;
  const props: RenderSettingsUiRequest & { backendHost: string } = {
    backendHost: "https://portfolio.example",
    invocationContext: { reason: "publish", publishRef, outputType },
    updatePublishSettings: jest.fn((settings) => {
      publishRef = settings.publishRef ?? "";
      return Promise.resolve({ status: "completed" as const });
    }),
    registerOnContextChange: (callbacks) => {
      onContextChange = callbacks.onContextChange;
      return () => {};
    },
  };
  const view = renderInTestProvider(<SettingsUi {...props} />);
  await screen.findByText("Select one or more options");
  await waitFor(() =>
    expect(JSON.parse(publishRef).designId).toBe(
      "publisher-permissions-design",
    ),
  );
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ designRequest }) });
  globalThis.fetch = fetchMock;
  const result = await publishToPortfolio(
    {
      publishRef,
      outputType,
      outputMedia: [
        {
          mediaSlotId: "media",
          files: [
            {
              format: "png",
              url: "https://example.com/design.png",
              widthPx: 800,
              heightPx: 600,
              contentMetadata: {
                type: "design",
                designToken,
                title: "Artwork",
                pages: [],
              },
            },
          ],
        },
      ],
    },
    "https://portfolio.example",
  );
  expect(result.status).toBe("app_error");
  if (result.status !== "app_error")
    throw new Error("Expected review response");
  act(() =>
    onContextChange?.({
      reason: "publish_error",
      error: { appDefinedPayload: result.appDefinedPayload },
    }),
  );
  await screen.findByRole("textbox", { name: "Which gallery?" });
  expect(loadWorkflow(key)?.analysis?.id).toBe(designRequest.id);
  view.unmount();
  // A saved publishRef also supports restoring when selection metadata is absent.
  renderInTestProvider(
    <SettingsUi
      {...props}
      invocationContext={{ reason: "publish", publishRef }}
    />,
  );
  await screen.findByRole("textbox", { name: "Which gallery?" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getDesignToken).not.toHaveBeenCalled();
  clearWorkflow(key);
});
