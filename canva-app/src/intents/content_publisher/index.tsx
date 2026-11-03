import { AppI18nProvider, initIntl } from "@canva/app-i18n-kit";
import { AppUiProvider } from "@canva/app-ui-kit";
import type {
  ContentPublisherIntent,
  GetPublishConfigurationResponse,
  RenderPreviewUiRequest,
  RenderSettingsUiRequest,
} from "@canva/intents/content";
import { createRoot } from "react-dom/client";
import "@canva/app-ui-kit/styles.css";
import { PreviewUi } from "./preview_ui";
import { SettingsUi } from "./settings_ui";
import { publishToPortfolio } from "./publish";

const intl = initIntl();

// Render the settings UI where users configure publishing options
function renderSettingsUi(request: RenderSettingsUiRequest) {
  const root = createRoot(document.getElementById("root") as Element);
  root.render(
    <AppI18nProvider>
      <AppUiProvider>
        <SettingsUi {...request} />
      </AppUiProvider>
    </AppI18nProvider>,
  );
}

// Render the preview UI showing how the content will appear after publishing
function renderPreviewUi(request: RenderPreviewUiRequest) {
  const root = createRoot(document.getElementById("root") as Element);
  root.render(
    <AppI18nProvider>
      <AppUiProvider>
        <PreviewUi {...request} />
      </AppUiProvider>
    </AppI18nProvider>,
  );
}

// Define the output types (publishing formats) available to users
// Canva automatically displays a dropdown selector when more than one output type is defined
async function getPublishConfiguration(): Promise<GetPublishConfigurationResponse> {
  return {
    status: "completed",
    outputTypes: [
      {
        id: "portfolio",
        displayName: intl.formatMessage({
          defaultMessage: "Portfolio design",
          description:
            "Label for publishing format shown in the output type dropdown",
        }),
        mediaSlots: [
          {
            id: "media",
            displayName: intl.formatMessage({
              defaultMessage: "Media",
              description: "Label for the media upload slot",
            }),
            fileCount: { exact: 1 },
            accepts: {
              image: {
                format: "png",
              },
            },
          },
        ],
      },
    ],
  };
}

const contentPublisher: ContentPublisherIntent = {
  renderSettingsUi,
  renderPreviewUi,
  getPublishConfiguration,
  publishContent: (request) => publishToPortfolio(request, BACKEND_HOST),
};

export default contentPublisher;
