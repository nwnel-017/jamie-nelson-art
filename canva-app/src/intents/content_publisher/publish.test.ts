import { clearWorkflow, saveWorkflow, loadWorkflow } from "./workflow_storage";
jest.mock("./workflow_storage", () => ({
  ...jest.requireActual("./workflow_storage"),
  workflowStorageKey: jest.fn().mockResolvedValue("test-scope"),
}));
import { parseDesignRequestResponse } from "./design_request";
import { designRequest } from "./test_fixtures";
import { auth } from "@canva/user";
import type { PublishContentRequest } from "@canva/intents/content";
import { publishToPortfolio } from "./publish";
import { parsePublishSettings } from "./types";

const request: PublishContentRequest = {
  publishRef: JSON.stringify({
    instructions: "  Add this to the portfolio.  ",
    changeOptions: ["existing_pages", "website_theme"],
  }),
  outputType: {
    id: "portfolio",
    displayName: "Portfolio design",
    mediaSlots: [],
  },
  outputMedia: [
    {
      mediaSlotId: "media",
      files: [
        {
          format: "png",
          url: "https://example.com/export.png",
          widthPx: 800,
          heightPx: 600,
          contentMetadata: {
            type: "design",
            designToken: "test-design-token",
            title: "Artwork",
            pages: [],
          },
        },
      ],
    },
  ],
};
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  clearWorkflow("test-scope");
  jest
    .mocked(auth.getCanvaUserToken)
    .mockResolvedValue(
      "test-user-token" as Awaited<ReturnType<typeof auth.getCanvaUserToken>>,
    );
  globalThis.fetch = fetchMock;
});

afterEach(() => jest.useRealTimers());

test("sends trimmed instructions and exported media to the handoff endpoint", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ designRequest }),
  });
  expect(
    await publishToPortfolio(request, "https://portfolio.example/"),
  ).toEqual({
    status: "app_error",
    message:
      "Thank you for submitting. Please answer the following questions before updating your site",
    localizedMessageId: "design_clarification_required",
    appDefinedPayload: JSON.stringify({
      type: "design_analysis",
      designRequest,
    }),
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "https://portfolio.example/api/agent/gather-requirements",
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-token",
      },
      body: JSON.stringify({
        submission_id: loadWorkflow("test-scope")!.initialSubmissionId,
        source: "canva",
        instructions: "Add this to the portfolio.",
        changeOptions: ["existing_pages", "website_theme"],
        outputMedia: request.outputMedia,
      }),
    }),
  );
});

test.each([
  undefined,
  "null",
  "[]",
  '{"instructions":42}',
  '{"caption":"old"}',
  "bad json",
])("rejects malformed settings: %s", async (publishRef) => {
  expect(parsePublishSettings(publishRef)).toBeUndefined();
  expect(
    await publishToPortfolio(
      { ...request, publishRef },
      "https://portfolio.example",
    ),
  ).toMatchObject({
    status: "app_error",
    message: "Valid AI instructions are required.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(["   ", "a".repeat(4001)])(
  "rejects blank or oversized instructions",
  async (instructions) => {
    expect(
      await publishToPortfolio(
        {
          ...request,
          publishRef: JSON.stringify({
            instructions,
            changeOptions: ["existing_pages"],
          }),
        },
        "https://portfolio.example",
      ),
    ).toMatchObject({
      status: "app_error",
      message: "Valid AI instructions are required.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

test("rejects missing exported media", async () => {
  expect(
    await publishToPortfolio(
      { ...request, outputMedia: [] },
      "https://portfolio.example",
    ),
  ).toMatchObject({
    status: "app_error",
    message: "Select a design page to send.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("does not report completion for backend errors", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  expect(
    await publishToPortfolio(request, "https://portfolio.example"),
  ).toMatchObject({ status: "app_error", httpCode: 503 });
});

test("requires the backend success acknowledgement", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ message: "failed" }),
  });
  expect(
    await publishToPortfolio(request, "https://portfolio.example"),
  ).toMatchObject({ status: "app_error" });
});

test("handles network and invalid JSON failures", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network error"));
  expect(
    await publishToPortfolio(request, "https://portfolio.example"),
  ).toMatchObject({ status: "app_error" });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => {
      throw new SyntaxError();
    },
  });
  expect(
    await publishToPortfolio(request, "https://portfolio.example"),
  ).toMatchObject({ status: "app_error" });
});

test("times out a stalled request so it can be retried", async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")));
      }),
  );
  const result = publishToPortfolio(request, "https://portfolio.example");
  await jest.advanceTimersByTimeAsync(90000);
  expect(await result).toMatchObject({ status: "app_error" });
});

test("does not submit if Canva cannot issue a user token", async () => {
  jest
    .mocked(auth.getCanvaUserToken)
    .mockRejectedValueOnce(new Error("Not available"));
  expect(
    await publishToPortfolio(request, "https://portfolio.example"),
  ).toMatchObject({ status: "app_error" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  undefined,
  [],
  ["unknown"],
  ["existing_pages", "existing_pages"],
  "new_pages",
])("rejects missing or invalid change options: %j", async (changeOptions) => {
  expect(
    await publishToPortfolio(
      {
        ...request,
        publishRef: JSON.stringify({
          instructions: "Update the gallery.",
          changeOptions,
        }),
      },
      "https://portfolio.example",
    ),
  ).toMatchObject({
    status: "app_error",
    message: "Select one or more valid change options.",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("subsequent Publish opens the saved result without analysis or automatic approval", async () => {
  saveWorkflow("test-scope", {
    instructions: designRequest.instructions,
    changeOptions: ["existing_pages"],
    analysis: { ...designRequest, ready: true },
  });
  const response = await publishToPortfolio(
    {
      ...request,
      outputMedia: [],
      publishRef: JSON.stringify({
        instructions: designRequest.instructions,
        changeOptions: ["existing_pages"],
        designRequestId: designRequest.id,
      }),
    },
    "https://portfolio.example",
  );
  expect(response.status).toBe("app_error");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a cached approval marker cannot complete Canva publishing", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ designRequest }),
  });
  const result = await publishToPortfolio(
    {
      ...request,
      publishRef: JSON.stringify({
        instructions: designRequest.instructions,
        changeOptions: ["existing_pages"],
        approvedRequestId: designRequest.id,
      }),
    },
    "https://portfolio.example",
  );
  expect(result.status).toBe("app_error");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("an initially ready response remains review-only", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      designRequest: {
        ...designRequest,
        ready: true,
        clarifying_questions: [],
      },
    }),
  });
  const result = await publishToPortfolio(request, "https://portfolio.example");
  expect(result.status).toBe("app_error");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("network retries reuse the initial submission ID", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network error"));
  await publishToPortfolio(request, "https://portfolio.example");
  const id = JSON.parse(fetchMock.mock.calls[0][1].body).submission_id;
  await publishToPortfolio(request, "https://portfolio.example");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).submission_id).toBe(id);
});

test("accepts local Supabase image URLs while rejecting remote HTTP image URLs", () => {
  for (const host of ["127.0.0.1:54321", "localhost:54321", "[::1]:54321"]) {
    const local = {
      ...designRequest,
      design_image: `http://${host}/storage/v1/object/public/website_designs/design.png`,
    };
    expect(
      parseDesignRequestResponse({ designRequest: local }).design_image,
    ).toBe(local.design_image);
  }
  for (const design_image of [
    "http://example.com/storage/v1/object/public/website_designs/design.png",
    "http://127.0.0.1:54321/unrelated",
    "javascript:alert(1)",
  ]) {
    expect(() =>
      parseDesignRequestResponse({
        designRequest: { ...designRequest, design_image },
      }),
    ).toThrow();
  }
});
