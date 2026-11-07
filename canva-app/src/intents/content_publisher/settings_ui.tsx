import { ClarificationUi } from "./clarification_ui";
import {
  parseDesignRequestResponse,
  type DesignRequest,
} from "./design_request";
import {
  clearWorkflow,
  loadWorkflow,
  saveWorkflow,
  workflowStorageKey,
  selectedDesignId,
} from "./workflow_storage";
import {
  Button,
  CheckboxGroup,
  FormField,
  Rows,
  Text,
  MultilineInput,
} from "@canva/app-ui-kit";
import type { RenderSettingsUiRequest } from "@canva/intents/content";
import { useEffect, useState, useRef } from "react";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";
import {
  isValidInstructions,
  isValidChangeOptions,
  isChangeOption,
  type ChangeOption,
  MAX_INSTRUCTIONS_LENGTH,
  parsePublishSettings,
} from "./types";

export const SettingsUi = ({
  invocationContext,
  updatePublishSettings,
  registerOnContextChange,
  backendHost = "",
}: RenderSettingsUiRequest & { backendHost?: string }) => {
  const intl = useIntl();
  const initial = parsePublishSettings(invocationContext?.publishRef);
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [changeOptions, setChangeOptions] = useState<ChangeOption[]>(
    initial?.changeOptions ?? [],
  );
  const [designId, setDesignId] = useState(
    selectedDesignId(invocationContext?.outputType) ?? initial?.designId,
  );
  const previousDesignId = useRef(designId);
  const [analysis, setAnalysis] = useState<DesignRequest>();
  const [approvedId, setApprovedId] = useState(initial?.approvedRequestId);
  const [restored, setRestored] = useState(false);
  const key = useRef<string | undefined>(undefined);
  const received = useRef(false);

  useEffect(() => {
    let active = true;
    setRestored(false);
    const changedDesign =
      previousDesignId.current !== undefined &&
      previousDesignId.current !== designId;
    previousDesignId.current = designId;
    if (changedDesign) {
      received.current = false;
      setAnalysis(undefined);
      setApprovedId(undefined);
    }
    void workflowStorageKey(backendHost, designId).then((value) => {
      if (!active) return;
      key.current = value;
      const saved = loadWorkflow(value);
      if (!received.current && saved) {
        setInstructions(saved.instructions);
        setChangeOptions(saved.changeOptions);
        setAnalysis(saved.analysis);
      }
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, [backendHost, designId]);

  useEffect(
    () =>
      registerOnContextChange({
        onContextChange: (context) => {
          if (context.reason === "publish_settings") {
            const nextDesignId = selectedDesignId(context.outputType);
            if (nextDesignId) setDesignId(nextDesignId);
            return;
          }
          if (
            context.reason !== "publish_error" ||
            !context.error.appDefinedPayload
          )
            return;
          try {
            const payload = JSON.parse(context.error.appDefinedPayload);
            if (payload.type !== "design_analysis") return;
            const result = parseDesignRequestResponse(payload);
            if (
              typeof payload.designId === "string" &&
              payload.designId.length <= 256
            )
              setDesignId(payload.designId);
            received.current = true;
            setAnalysis(result);
            setApprovedId(undefined);
          } catch {
            /* Ignore unrelated or malformed errors. */
          }
        },
      }),
    [registerOnContextChange],
  );

  useEffect(() => {
    if (!restored) {
      updatePublishSettings({
        validityState: "invalid_missing_required_fields",
      });
      return;
    }
    if (!approvedId) {
      const previous = loadWorkflow(key.current);
      saveWorkflow(key.current, {
        ...previous,
        instructions,
        changeOptions,
        ...(analysis ? { analysis } : {}),
      });
    }
    // The first Publish starts analysis. Once a request exists, only approval
    // can unlock Publish again; entering answers alone must not bypass analysis.
    const canPublish =
      isValidInstructions(instructions) &&
      isValidChangeOptions(changeOptions) &&
      (!analysis || Boolean(approvedId));
    updatePublishSettings({
      publishRef: JSON.stringify({
        instructions,
        changeOptions,
        ...(designId ? { designId } : {}),
        ...(analysis ? { designRequestId: analysis.id } : {}),
        ...(approvedId ? { approvedRequestId: approvedId } : {}),
      }),
      validityState: canPublish ? "valid" : "invalid_missing_required_fields",
    });
  }, [
    instructions,
    changeOptions,
    designId,
    analysis,
    approvedId,
    restored,
    updatePublishSettings,
  ]);

  if (!restored)
    return (
      <Text>
        {intl.formatMessage({
          defaultMessage: "Restoring your request…",
          description: "Restoring saved workflow",
        })}
      </Text>
    );
  if (analysis || approvedId)
    return (
      <div className={styles.scrollContainer}>
        <Rows spacing="2u">
          {approvedId ? (
            <Text>
              {intl.formatMessage({
                defaultMessage: "Request approved and queued.",
                description: "Approval accepted and technical planning queued",
              })}
            </Text>
          ) : (
            analysis && (
              <ClarificationUi
                key={`${analysis.id}:${analysis.draft?.version ?? 0}`}
                request={analysis}
                backendHost={backendHost}
                storageKey={key.current}
                onSubmitted={setAnalysis}
                onApproved={() => {
                  clearWorkflow(key.current);
                  setApprovedId(analysis.id);
                }}
              />
            )
          )}
          <Button
            variant="secondary"
            onClick={() => {
              received.current = true;
              clearWorkflow(key.current);
              setAnalysis(undefined);
              setApprovedId(undefined);
            }}
          >
            {intl.formatMessage({
              defaultMessage: "Start a new request",
              description: "Return to the design request form",
            })}
          </Button>
        </Rows>
      </div>
    );

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Text>
          {intl.formatMessage({
            defaultMessage:
              "Send your design to your portfolio with instructions for your AI husband to complete.",
            description: "Explains the portfolio handoff form",
          })}
        </Text>
        <FormField
          label={intl.formatMessage({
            defaultMessage: "Select one or more options",
            description: "Label for requested website changes",
          })}
          control={(props) => (
            <CheckboxGroup
              {...props}
              value={changeOptions}
              onChange={(values) =>
                setChangeOptions(values.filter(isChangeOption))
              }
              options={[
                {
                  value: "existing_pages",
                  label: intl.formatMessage({
                    defaultMessage: "Changes to one or more existing pages",
                    description: "Option to update existing website pages",
                  }),
                },
                {
                  value: "new_pages",
                  label: intl.formatMessage({
                    defaultMessage: "New pages",
                    description: "Option to create website pages",
                  }),
                },
                {
                  value: "website_theme",
                  label: intl.formatMessage({
                    defaultMessage: "Changes to website theme",
                    description: "Option to update the website theme",
                  }),
                },
              ]}
            />
          )}
        />
        <FormField
          label={intl.formatMessage({
            defaultMessage: "AI husband's instructions",
            description: "Label for instructions to the portfolio agent",
          })}
          control={(props) => (
            <MultilineInput
              {...props}
              value={instructions}
              onChange={setInstructions}
              maxLength={MAX_INSTRUCTIONS_LENGTH}
              placeholder={intl.formatMessage({
                defaultMessage:
                  "For example: Add this artwork to the exhibitions page with a short description.",
                description: "Example portfolio agent instruction",
              })}
            />
          )}
        />
      </Rows>
    </div>
  );
};
