import { loadWorkflow, saveWorkflow } from "./workflow_storage";
import {
  Button,
  FormField,
  FileInput,
  ImageCard,
  MultilineInput,
  Rows,
  Text,
} from "@canva/app-ui-kit";
import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import {
  DesignAnalysisError,
  requestDesignAnalysis,
  approveDesignRequest,
  type DesignRequest,
  type DesignImage,
  uploadDesignAsset,
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
  const [images, setImages] = useState<Record<string, DesignImage>>(() =>
    Object.fromEntries(
      (request.draft?.clarifying_questions ?? []).flatMap((q) => {
        const image = [...(request.draft?.answers ?? [])]
          .reverse()
          .find((a) => a.image?.id === q.image_id)?.image;
        return image ? [[q.id, image]] : [];
      }),
    ),
  );
  const [keptImages, setKeptImages] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submissionId = useRef<string | undefined>(
    restoredAnswers?.submissionId,
  );
  const [budgetStopped, setBudgetStopped] = useState(request.budget_status === "stopped");
  const [limitReached, setLimitReached] = useState(false);
  const atLimit = limitReached || request.attempts_remaining === 0;
  const ready = request.ready === true;
  const response = request.response ?? request.draft?.response;
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
  const currentQuestion = request.draft?.clarifying_questions[index];
  const isImage = currentQuestion?.type === "image";
  const answered = (i: number) => {
    const q = request.draft?.clarifying_questions[i];
    if (q?.type !== "image") return !!answers[i]?.trim();
    const image = images[q.id];
    return (
      !!image &&
      (!q.image_id || image.id !== q.image_id || keptImages[q.id] === image.id)
    );
  };
  const upload = async (file: File) => {
    if (!currentQuestion || !request.draft) return;
    setUploading(true);
    setError("");
    try {
      const image = await uploadDesignAsset(
        request.id,
        backendHost,
        request.draft.version,
        currentQuestion.id,
        file,
      );
      setImages((previous) => ({ ...previous, [currentQuestion.id]: image }));
      submissionId.current = undefined;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not upload the image. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    if (questions.some((_, i) => !answered(i))) return;
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
        answers: request.draft.clarifying_questions.map((q, i) => {
          const image = images[q.id];
          return {
            question_id: q.id,
            answer: (answers[i] ?? "").trim(),
            ...(q.type === "image" && image
              ? {
                  image_id: image.id,
                  ...(keptImages[q.id] === image.id
                    ? { keep_anyway: true }
                    : {}),
                }
              : {}),
          };
        }),
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
      if (error instanceof DesignAnalysisError && error.code === "BUDGET_STOP") {
        setBudgetStopped(true);
        const previous = loadWorkflow(storageKey);
        if (previous) saveWorkflow(storageKey, { ...previous, analysis: { ...request, budget_status: "stopped" } });
      }
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
  if (budgetStopped)
    return (
      <Rows spacing="2u">
        <Text>{intl.formatMessage({
          defaultMessage: "Design update stopped because its spending allowance is exhausted or uncertain. Your progress has been kept. Contact the developer.",
          description: "Budget stop with preserved progress and developer contact guidance",
        })}</Text>
      </Rows>
    );
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
      {ready ? (
        <Text>
          {intl.formatMessage({
            defaultMessage:
              "Thank you for answering the questions. Please review the instructions",
            description: "Approval screen introduction",
          })}
        </Text>
      ) : (
        response && <Text>{response}</Text>
      )}
      {ready && (
        <>
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
        </>
      )}
      {ready ? (
        <>
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
          {error && <Text tone="critical">{error}</Text>}
          <Button
            variant="primary"
            loading={saving}
            disabled={saving || uploading}
            onClick={() => void approve()}
          >
            {intl.formatMessage({
              defaultMessage: "Approve",
              description: "Approve the final requirements",
            })}
          </Button>
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
              {isImage && currentQuestion && (
                <>
                  <Text variant="bold">{currentQuestion.question}</Text>
                  {currentQuestion.concern && (
                    <Text>{currentQuestion.concern}</Text>
                  )}
                  {currentQuestion.image_id &&
                    images[currentQuestion.id]?.id ===
                      currentQuestion.image_id && (
                      <Button
                        variant="secondary"
                        disabled={
                          saving ||
                          uploading ||
                          keptImages[currentQuestion.id] ===
                            currentQuestion.image_id
                        }
                        onClick={() => {
                          const imageId = currentQuestion.image_id;
                          if (!imageId) return;
                          setKeptImages((previous) => ({...previous, [currentQuestion.id]:imageId}));
                          submissionId.current = undefined;
                        }}
                      >
                        {intl.formatMessage({
                          defaultMessage: "Keep this image anyway",
                          description:
                            "Accept an image despite suitability concerns",
                        })}
                      </Button>
                    )}
                  <Text>
                    {intl.formatMessage({
                      defaultMessage:
                        "Validated uploads become publicly accessible. Upload a PNG, JPEG, or WebP image up to 5 MB.",
                      description: "Public image upload notice",
                    })}
                  </Text>
                  <FileInput
                    multiple={false}
                    accept={["image/png", "image/jpeg", "image/webp"]}
                    disabled={saving || uploading || atLimit}
                    onDropAcceptedFiles={(files) => {
                      const file = files[0];
                      if (file) void upload(file);
                    }}
                    onDropRejectedFiles={() =>
                      setError("Upload a PNG, JPEG, or WebP image.")
                    }
                  />
                  {images[currentQuestion.id] && (
                    <Text>{images[currentQuestion.id]?.filename}</Text>
                  )}
                </>
              )}
              <FormField
                label={
                  isImage
                    ? intl.formatMessage({
                        defaultMessage: "Optional note",
                        description: "Image answer note label",
                      })
                    : questions[index]!
                }
                control={(props) => (
                  <MultilineInput
                    {...props}
                    value={answers[index] ?? ""}
                    maxLength={4000}
                    disabled={saving || uploading}
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
                  disabled={saving || uploading}
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
              uploading ||
              limitReached ||
              request.attempts_remaining === 0 ||
              (!!questions.length && !answered(index))
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
