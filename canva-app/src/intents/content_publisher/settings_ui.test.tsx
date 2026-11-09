import { clearWorkflow, saveWorkflow, loadWorkflow } from "./workflow_storage";
jest.mock("./workflow_storage", () => ({
  ...jest.requireActual("./workflow_storage"),
  workflowStorageKey: jest.fn().mockResolvedValue("test-scope"),
}));
beforeEach(() => clearWorkflow("test-scope"));
import type { RenderSettingsUiRequest } from "@canva/intents/content";
import { designRequest } from "./test_fixtures";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderInTestProvider } from "src/utils/test_render";
import { SettingsUi } from "./settings_ui";

test("restores saved choices, supports multiple selections, and requires at least one", async () => {
  const instructions = "Update the portfolio.";
  const updatePublishSettings = jest.fn();
  renderInTestProvider(
    <SettingsUi
      invocationContext={{
        reason: "publish",
        publishRef: JSON.stringify({
          instructions,
          changeOptions: ["existing_pages"],
        }),
      }}
      updatePublishSettings={updatePublishSettings}
      registerOnContextChange={jest.fn()}
    />,
  );
  expect(await screen.findByText("Select one or more options")).toBeTruthy();
  const existing = screen.getByRole("checkbox", {
    name: "Changes to one or more existing pages",
  }) as HTMLInputElement;
  const newPages = screen.getByRole("checkbox", {
    name: "New pages",
  }) as HTMLInputElement;
  expect(existing.checked).toBe(true);
  expect(newPages.checked).toBe(false);
  expect(
    screen.getByRole("checkbox", { name: "Changes to website theme" }),
  ).toBeTruthy();

  fireEvent.click(newPages);
  expect(updatePublishSettings).toHaveBeenLastCalledWith({
    publishRef: JSON.stringify({
      instructions,
      changeOptions: ["existing_pages", "new_pages"],
    }),
    validityState: "valid",
  });
  fireEvent.click(existing);
  fireEvent.click(newPages);
  expect(updatePublishSettings).toHaveBeenLastCalledWith({
    publishRef: JSON.stringify({ instructions, changeOptions: [] }),
    validityState: "invalid_missing_required_fields",
  });
});

test("receives the full POST result from Canva without making a GET request", async () => {
  let signal:
    | Parameters<RenderSettingsUiRequest["registerOnContextChange"]>[0]
    | undefined;
  const updatePublishSettings = jest.fn();
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ designRequest }) });
  renderInTestProvider(
    <SettingsUi
      backendHost="https://portfolio.example"
      invocationContext={{
        reason: "publish",
        publishRef: JSON.stringify({
          instructions: designRequest.instructions,
          changeOptions: ["existing_pages"],
        }),
      }}
      updatePublishSettings={updatePublishSettings}
      registerOnContextChange={(value) => {
        signal = value;
        return () => {};
      }}
    />,
  );
  act(() =>
    signal!.onContextChange({
      reason: "publish_error",
      error: {
        appDefinedPayload: JSON.stringify({
          type: "design_analysis",
          designRequest,
        }),
      },
    }),
  );
  await screen.findByRole("textbox", { name: "Which gallery?" });
  expect(screen.getByText(designRequest.requirements[0]!)).toBeTruthy();
  await waitFor(() =>
    expect(updatePublishSettings).toHaveBeenLastCalledWith({
      publishRef: JSON.stringify({
        instructions: designRequest.instructions,
        changeOptions: ["existing_pages"],
        designRequestId: designRequest.id,
      }),
      validityState: "invalid_missing_required_fields",
    }),
  );
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test("reload restores the saved analysis without a network request", async () => {
  saveWorkflow("test-scope", {
    instructions: designRequest.instructions,
    changeOptions: ["existing_pages"],
    analysis: designRequest,
  });
  globalThis.fetch = jest.fn();
  const updatePublishSettings = jest.fn();
  renderInTestProvider(
    <SettingsUi
      backendHost="https://portfolio.example"
      invocationContext={{ reason: "publish" }}
      updatePublishSettings={updatePublishSettings}
      registerOnContextChange={jest.fn()}
    />,
  );
  await screen.findByRole("textbox", { name: "Which gallery?" });
  expect(updatePublishSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({
      validityState: "invalid_missing_required_fields",
    }),
  );
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test("an initially ready result shows Approve and approval clears the saved workflow", async () => {
  const ready = {
    ...designRequest,
    ready: true,
    clarifying_questions: [],
    ambiguities: [],
    draft: { ...designRequest.draft!, ready: true, clarifying_questions: [] },
  };
  saveWorkflow("test-scope", {
    instructions: ready.instructions,
    changeOptions: ["existing_pages"],
    analysis: ready,
  });
  const updatePublishSettings = jest.fn();
  let confirmApproval!: (response: unknown) => void;
  globalThis.fetch = jest.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        confirmApproval = resolve;
      }),
  );
  renderInTestProvider(
    <SettingsUi
      backendHost="https://portfolio.example"
      invocationContext={{ reason: "publish" }}
      updatePublishSettings={updatePublishSettings}
      registerOnContextChange={jest.fn()}
    />,
  );
  const approve = await screen.findByRole("button", { name: "Approve" });
  expect(updatePublishSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({
      validityState: "invalid_missing_required_fields",
    }),
  );
  fireEvent.click(approve);
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  expect(updatePublishSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({
      validityState: "invalid_missing_required_fields",
    }),
  );
  await act(async () =>
    confirmApproval({
      ok: true,
      json: async () => ({
        success: true,
        requestId: ready.id,
        draft_version: 1,
        jobId: "12345678-1234-4234-8234-123456789ddd",
        status: "queued",
      }),
    }),
  );
  await screen.findByText(
    "Your agent is working on your request. You will be sent an email when it is ready to review.",
  );
  expect(loadWorkflow("test-scope")).toBeUndefined();
  await waitFor(() =>
    expect(updatePublishSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publishRef: JSON.stringify({
          instructions: ready.instructions,
          changeOptions: ["existing_pages"],
          designRequestId: ready.id,
          approvedRequestId: ready.id,
        }),
        validityState: "valid",
      }),
    ),
  );
});

test("Publish stays disabled while answers are entered, analyzed, and reviewed", async () => {
  saveWorkflow("test-scope", {
    instructions: designRequest.instructions,
    changeOptions: ["existing_pages"],
    analysis: designRequest,
  });
  const ready = {
    ...designRequest,
    ready: true,
    ambiguities: [],
    clarifying_questions: [],
    draft: {
      ...designRequest.draft!,
      version: 2,
      ready: true,
      clarifying_questions: [],
    },
  };
  let finishAnalysis!: (response: unknown) => void;
  globalThis.fetch = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishAnalysis = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        statusMessage: "Approval failed. Please try again.",
      }),
    });
  const updatePublishSettings = jest.fn();
  renderInTestProvider(
    <SettingsUi
      backendHost="https://portfolio.example"
      invocationContext={{ reason: "publish" }}
      updatePublishSettings={updatePublishSettings}
      registerOnContextChange={jest.fn()}
    />,
  );
  const expectDisabled = () =>
    expect(updatePublishSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        validityState: "invalid_missing_required_fields",
      }),
    );
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Which gallery?" }),
    {
      target: { value: "/gallery" },
    },
  );
  expectDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Which color?" }), {
    target: { value: "Blue" },
  });
  expectDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  expectDisabled();
  await act(async () =>
    finishAnalysis({
      ok: true,
      json: async () => ({ designRequest: ready }),
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  await screen.findByText("Approval failed. Please try again.");
  expectDisabled();
  expect(
    updatePublishSettings.mock.calls.some(
      ([settings]) => settings.validityState === "valid",
    ),
  ).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Start a new request" }));
  await screen.findByText("Select one or more options");
  expect(updatePublishSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({ validityState: "valid" }),
  );
});
