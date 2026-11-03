import { FormField, Rows, Text, MultilineInput } from "@canva/app-ui-kit";
import type { RenderSettingsUiRequest } from "@canva/intents/content";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";
import {
  isValidInstructions,
  MAX_INSTRUCTIONS_LENGTH,
  parsePublishSettings,
} from "./types";

export const SettingsUi = ({
  invocationContext,
  updatePublishSettings,
}: RenderSettingsUiRequest) => {
  const intl = useIntl();
  const [instructions, setInstructions] = useState(
    parsePublishSettings(invocationContext?.publishRef)?.instructions ?? "",
  );

  useEffect(() => {
    updatePublishSettings({
      publishRef: JSON.stringify({ instructions }),
      validityState: isValidInstructions(instructions)
        ? "valid"
        : "invalid_missing_required_fields",
    });
  }, [instructions, updatePublishSettings]);

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
