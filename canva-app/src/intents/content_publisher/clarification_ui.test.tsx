import { clearWorkflow, loadWorkflow, saveWorkflow } from "./workflow_storage";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderInTestProvider } from "src/utils/test_render";
import { ClarificationUi } from "./clarification_ui";
import { designRequest } from "./test_fixtures";
import type { DesignRequest } from "./design_request";

function Review({ initial = designRequest }: { initial?: DesignRequest }) {
  const [request, setRequest] = useState(initial);
  return (
    <ClarificationUi
      key={`${request.id}:${request.draft?.version ?? 0}`}
      request={request}
      backendHost="https://portfolio.example"
      onSubmitted={setRequest}
    />
  );
}

test("shows analysis, asks one question at a time, and preserves answers when submission fails", async () => {
  const saved = {
    ...designRequest,
    ready: true,
    draft: {
      ...designRequest.draft!,
      version: 2,
      ready: true,
      clarifying_questions: [],
      plan: {
        steps: [
          {
            id: "step-1",
            action: "Update the gallery page.",
            target: "/gallery",
          },
        ],
      },
    },
    plan: {
      steps: [
        {
          id: "step-1",
          action: "Update the gallery page.",
          target: "/gallery",
        },
      ],
    },
    clarified_at: "2026-11-03T01:00:00Z",
    clarifications: [
      { question: "Which gallery?", answer: "Exhibitions" },
      { question: "Which color?", answer: "Blue" },
    ],
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ designRequest: saved }),
    });
  globalThis.fetch = fetchMock;
  renderInTestProvider(<Review />);
  expect(screen.getByText(designRequest.requirements[0]!)).toBeTruthy();
  expect(screen.getByText(designRequest.ambiguities[0]!)).toBeTruthy();
  expect(screen.queryByText("Which color?")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.change(screen.getByRole("textbox", { name: "Which gallery?" }), {
    target: { value: "Exhibitions" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByRole("textbox", { name: "Which gallery?" })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Submit" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.change(screen.getByRole("textbox", { name: "Which color?" }), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("Could not analyze your answers. Please try again.");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Which color?",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Blue");
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(
    "Your requirements are understood. Review the instructions below, then approve.",
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).submission_id).toBe(
    JSON.parse(fetchMock.mock.calls[1][1].body).submission_id,
  );
  expect(fetchMock).toHaveBeenLastCalledWith(
    `https://portfolio.example/api/agent/clarify-requirements/${designRequest.id}`,
    expect.objectContaining({
      method: "POST",
      body: expect.any(String),
    }),
  );
});

test("a ready plan shows its required steps without asking for another submission", () => {
  const plan = {
    steps: [
      {
        id: "step-1",
        action: "Apply blue colors to the gallery.",
        target: "/gallery",
      },
    ],
  };
  const initial = {
    ...designRequest,
    ready: true,
    plan,
    clarifying_questions: [],
    ambiguities: [],
    draft: {
      ...designRequest.draft!,
      ready: true,
      plan,
      clarifying_questions: [],
    },
  };
  renderInTestProvider(<Review initial={initial} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  expect(screen.getByText("Apply blue colors to the gallery.")).toBeTruthy();
  expect(
    screen.getByText(
      "Your requirements are understood. Review the instructions below, then approve.",
    ),
  ).toBeTruthy();
});

test.each(["pending", "failed"] as const)(
  "a %s analysis cannot be submitted as an empty clarification",
  (analysis_status) => {
    renderInTestProvider(
      <Review
        initial={{
          ...designRequest,
          analysis_status,
          draft: null,
          clarifying_questions: [],
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  },
);

test("a follow-up version restarts the question wizard and a later ready response shows the plan", async () => {
  const followup = {
    ...designRequest,
    draft_version: 2,
    analyze_attempts: 2,
    attempts_remaining: 2,
    clarifying_questions: ["Which exact URL?"],
    draft: {
      ...designRequest.draft!,
      version: 2,
      clarifying_questions: [
        {
          id: "12345678-1234-4234-8234-123456789ab3",
          question: "Which exact URL?",
        },
      ],
    },
  };
  const plan = {
    steps: [
      {
        id: "step-1",
        action: "Update the specified gallery.",
        target: "/gallery",
      },
    ],
  };
  const ready = {
    ...followup,
    ready: true,
    plan,
    clarified_at: "2026-11-03T01:00:00Z",
    clarifying_questions: [],
    draft: {
      ...followup.draft,
      version: 3,
      ready: true,
      plan,
      clarifying_questions: [],
    },
  };
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ designRequest: followup }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ designRequest: ready }),
    });
  globalThis.fetch = fetchMock;
  renderInTestProvider(<Review />);
  fireEvent.change(screen.getByRole("textbox", { name: "Which gallery?" }), {
    target: { value: "Not sure" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Which color?" }), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  const question = await screen.findByRole("textbox", {
    name: "Which exact URL?",
  });
  expect((question as HTMLTextAreaElement).value).toBe("");
  expect(screen.getByText("Question 1 of 1")).toBeTruthy();
  fireEvent.change(question, { target: { value: "/gallery" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("Update the specified gallery.");
  const first = JSON.parse(fetchMock.mock.calls[0][1].body);
  const second = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(first.draft_version).toBe(1);
  expect(second.draft_version).toBe(2);
  expect(first.submission_id).not.toBe(second.submission_id);
  expect(second.answers).toEqual([
    { question_id: "12345678-1234-4234-8234-123456789ab3", answer: "/gallery" },
  ]);
});

test("an exhausted attempt budget shows an error and prevents another analysis", () => {
  renderInTestProvider(
    <Review
      initial={{ ...designRequest, attempts_remaining: 0, analyze_attempts: 4 }}
    />,
  );
  expect(
    screen.getByText(
      "The analysis attempt limit has been reached. Your latest draft has been kept.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled"),
  ).toBe("true");
});

test("Approve calls execute and succeeds even when the analysis budget is exhausted", async () => {
  const approved = jest.fn();
  const fetchMock = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, requestId: designRequest.id }),
    });
  globalThis.fetch = fetchMock;
  renderInTestProvider(
    <ClarificationUi
      request={{
        ...designRequest,
        ready: true,
        attempts_remaining: 0,
        clarifying_questions: [],
      }}
      backendHost="https://portfolio.example"
      onSubmitted={jest.fn()}
      onApproved={approved}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(approved).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    `https://portfolio.example/api/agent/execute/${designRequest.id}`,
    expect.objectContaining({ method: "POST" }),
  );
  const options = fetchMock.mock.calls[0]![1];
  expect(options).not.toHaveProperty("body");
  expect(options.headers).not.toHaveProperty("Content-Type");
});

test("answers and their submission ID survive remounts and retry the same POST", async () => {
  const key = "clarification-reload";
  clearWorkflow(key);
  saveWorkflow(key, {
    instructions: designRequest.instructions,
    changeOptions: ["existing_pages"],
    analysis: designRequest,
  });
  const fetchMock = jest.fn().mockRejectedValue(new TypeError("Network error"));
  globalThis.fetch = fetchMock;
  const props = {
    request: designRequest,
    backendHost: "https://portfolio.example",
    storageKey: key,
    onSubmitted: jest.fn(),
  };
  const view = renderInTestProvider(<ClarificationUi {...props} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Which gallery?" }), {
    target: { value: "Exhibitions" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Which color?" }), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("Network error");
  const savedId = loadWorkflow(key)!.answers!.submissionId;
  view.unmount();
  renderInTestProvider(<ClarificationUi {...props} />);
  expect(
    (
      screen.getByRole("textbox", {
        name: "Which gallery?",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Exhibitions");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("Network error");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).submission_id).toBe(
    savedId,
  );
  clearWorkflow(key);
});
