import { loadWorkflow, saveWorkflow } from "./workflow_storage";
import {
  Button,
  FormField,
  ImageCard,
  MultilineInput,
  Rows,
  Text,
} from "@canva/app-ui-kit";
import { PublishMessages } from "./publish.messages";
import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import {
  DesignAnalysisError,
  requestDesignAnalysis,
  approveDesignRequest,
  type DesignRequest,
} from "./design_request";

export function ClarificationUi({
  request,
  backendHost,
  onSubmitted,
  storageKey,
  onApproved = () => {},
}: {
  request: DesignRequest;
  backendHost: string;
  onSubmitted: (request: DesignRequest) => void;
  storageKey?: string;
  onApproved?: () => void;
}) {
  const intl = useIntl();
  const [index, setIndex] = useState(0);
  const persisted = loadWorkflow(storageKey)?.answers;
  const restoredAnswers =
    persisted?.requestId === request.id &&
    persisted.version === request.draft?.version
      ? persisted
      : undefined;
  const [answers, setAnswers] = useState<string[]>(() =>
    request.clarifying_questions.map(
      (_, i) => restoredAnswers?.values[i] ?? "",
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submissionId = useRef<string | undefined>(
    restoredAnswers?.submissionId,
  );
  const [limitReached, setLimitReached] = useState(false);
  const atLimit = limitReached || request.attempts_remaining === 0;
  const ready = request.ready === true;
  const persistAnswers = (values: string[]) => {
    const saved = loadWorkflow(storageKey);
    if (saved)
      saveWorkflow(storageKey, {
        ...saved,
        answers: {
          requestId: request.id,
          version: request.draft?.version ?? 0,
          values,
          submissionId: submissionId.current,
        },
      });
  };
  const approve = async () => {
    setSaving(true);
    setError("");
    try {
      await approveDesignRequest(request.id, backendHost);
      onApproved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not approve this request.",
      );
    } finally {
      setSaving(false);
    }
  };
  const questions = request.clarifying_questions;
  const last = index === questions.length - 1;
  const submit = async () => {
    if (answers.some((answer) => !answer.trim())) return;
    setSaving(true);
    setError("");
    try {
      if (!request.draft)
        throw new Error("Start a new request to create a versioned draft.");
      submissionId.current ??= crypto.randomUUID();
      persistAnswers(answers);
      const saved = await requestDesignAnalysis(request.id, backendHost, {
        draft_version: request.draft.version,
        submission_id: submissionId.current,
        answers: request.draft.clarifying_questions.map((q, i) => ({
          question_id: q.id,
          answer: answers[i]!.trim(),
        })),
      });
      const previous = loadWorkflow(storageKey);
      if (previous)
        saveWorkflow(storageKey, {
          ...previous,
          analysis: saved,
          answers: undefined,
        });
      onSubmitted(saved);
    } catch (error) {
      if (
        error instanceof DesignAnalysisError &&
        error.code === "ANALYSIS_FAILED"
      ) {
        submissionId.current = undefined;
        persistAnswers(answers);
      }
      if (
        error instanceof DesignAnalysisError &&
        error.code === "ANALYSIS_LIMIT_REACHED"
      ) {
        setLimitReached(true);
        const previous = loadWorkflow(storageKey);
        if (previous)
          saveWorkflow(storageKey, {
            ...previous,
            analysis: { ...request, attempts_remaining: 0 },
          });
      }
      setError(
        error instanceof Error
          ? error.message
          : "Could not analyze your answers. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (
    request.analysis_status === "pending" ||
    (request.analysis_status === "failed" && !request.draft)
  )
    return (
      <Rows spacing="2u">
        <Text>
          {request.analysis_status === "failed"
            ? intl.formatMessage({
                defaultMessage:
                  "Analysis failed. Start a new request to try again.",
                description: "Failed analysis state",
              })
            : intl.formatMessage({
                defaultMessage:
                  "Your request has been saved and is still being analyzed.",
                description: "Pending analysis state",
              })}
        </Text>
        {error && <Text tone="critical">{error}</Text>}
      </Rows>
    );

  return (
    <Rows spacing="2u">
      {!ready && (
        <Text>{intl.formatMessage(PublishMessages.clarificationRequired)}</Text>
      )}
      <Text variant="bold">
        {intl.formatMessage({
          defaultMessage: "Design analysis",
          description: "Analysis heading",
        })}
      </Text>
      <ImageCard
        thumbnailUrl={request.design_image}
        alt={intl.formatMessage({
          defaultMessage: "Your exported design",
          description: "Exported design image description",
        })}
      />
      <Text>{request.instructions}</Text>
      <Text variant="bold">
        {intl.formatMessage({
          defaultMessage: "Requirements",
          description: "Requirements heading",
        })}
      </Text>
      {request.requirements.map((item, i) => (
        <Text key={i}>{item}</Text>
      ))}
      <Text variant="bold">
        {intl.formatMessage({
          defaultMessage: "Ambiguities",
          description: "Ambiguities heading",
        })}
      </Text>
      {request.ambiguities.map((item, i) => (
        <Text key={i}>{item}</Text>
      ))}
      {request.attempts_remaining !== undefined && (
        <Text>
          {intl.formatMessage(
            {
              defaultMessage: "Analysis attempts remaining: {count}",
              description: "Remaining plan analysis attempts",
            },
            { count: limitReached ? 0 : request.attempts_remaining },
          )}
        </Text>
      )}
      {ready ? (
        <>
          <Text>
            {intl.formatMessage({
              defaultMessage:
                "Your requirements are understood. Review the instructions below, then approve.",
              description: "Clarifications saved confirmation",
            })}
          </Text>
          <Button
            variant="primary"
            loading={saving}
            disabled={saving}
            onClick={() => void approve()}
          >
            {intl.formatMessage({
              defaultMessage: "Approve",
              description: "Approve the final requirements",
            })}
          </Button>
          {error && <Text tone="critical">{error}</Text>}
          {request.plan?.steps.map((step) => (
            <Rows key={step.id} spacing="1u">
              <Text variant="bold">{step.action}</Text>
              <Text>{step.target}</Text>
              {step.details && <Text>{step.details}</Text>}
            </Rows>
          ))}
          {request.clarifications.map((item, i) => (
            <Rows key={i} spacing="1u">
              <Text variant="bold">{item.question}</Text>
              <Text>{item.answer}</Text>
            </Rows>
          ))}
        </>
      ) : (
        <>
          {questions.length ? (
            <>
              <Text>
                {intl.formatMessage(
                  {
                    defaultMessage: "Question {current} of {total}",
                    description: "Clarification progress",
                  },
                  { current: index + 1, total: questions.length },
                )}
              </Text>
              <FormField
                label={questions[index]!}
                control={(props) => (
                  <MultilineInput
                    {...props}
                    value={answers[index] ?? ""}
                    maxLength={4000}
                    disabled={saving}
                    onChange={(value) => {
                      {
                        submissionId.current = undefined;
                        persistAnswers(answers);
                      }
                      const values = answers.map((answer, i) =>
                        i === index ? value : answer,
                      );
                      setAnswers(values);
                      persistAnswers(values);
                    }}
                  />
                )}
              />
              {index > 0 && (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setIndex(index - 1)}
                >
                  {intl.formatMessage({
                    defaultMessage: "Back",
                    description: "Previous clarification question",
                  })}
                </Button>
              )}
            </>
          ) : (
            <Text>
              {intl.formatMessage({
                defaultMessage: "Review the current plan before continuing.",
                description: "No clarification needed",
              })}
            </Text>
          )}
          {atLimit && !error && (
            <Text tone="critical">
              {intl.formatMessage({
                defaultMessage:
                  "The analysis attempt limit has been reached. Your latest draft has been kept.",
                description: "Analysis attempt budget exhausted",
              })}
            </Text>
          )}
          {error && (
            <>
              <Text tone="critical">{error}</Text>
            </>
          )}
          <Button
            variant="primary"
            loading={saving}
            disabled={
              saving ||
              limitReached ||
              request.attempts_remaining === 0 ||
              (!!questions.length && !answers[index]?.trim())
            }
            onClick={() => {
              if (last || !questions.length) void submit();
              else setIndex(index + 1);
            }}
          >
            {last || !questions.length
              ? intl.formatMessage({
                  defaultMessage: "Submit",
                  description: "Submit clarification answers",
                })
              : intl.formatMessage({
                  defaultMessage: "Next",
                  description: "Next clarification question",
                })}
          </Button>
        </>
      )}
    </Rows>
  );
}
