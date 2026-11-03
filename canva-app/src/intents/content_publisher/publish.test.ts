import { auth } from "@canva/user";
import type { PublishContentRequest } from "@canva/intents/content";
import { publishToPortfolio } from "./publish";
import { parsePublishSettings } from "./types";

const request: PublishContentRequest = {
  publishRef: JSON.stringify({
    instructions: "  Add this to the portfolio.  ",
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
    json: async () => ({ message: "success" }),
  });
  expect(
    await publishToPortfolio(request, "https://portfolio.example/"),
  ).toEqual({ status: "completed" });
  expect(fetchMock).toHaveBeenCalledWith(
    "https://portfolio.example/api/agent-handoff",
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-token",
      },
      body: JSON.stringify({
        source: "canva",
        instructions: "Add this to the portfolio.",
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
        { ...request, publishRef: JSON.stringify({ instructions }) },
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
  await jest.advanceTimersByTimeAsync(15000);
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
