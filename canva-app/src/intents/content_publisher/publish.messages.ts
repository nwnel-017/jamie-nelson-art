import { defineMessages } from "react-intl";

export const PublishMessages = defineMessages({
  clarificationRequired: {
    // Canva uses this stable ID to localize the recoverable publishing error.
    // eslint-disable-next-line formatjs/no-id
    id: "design_clarification_required",
    defaultMessage:
      "Thank you for submitting. Please answer the following questions before updating your site",
    description:
      "Message shown after design analysis when the user must review clarification questions before publishing",
  },
});
