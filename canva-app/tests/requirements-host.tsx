import { TestAppUiProvider, Button } from "@canva/app-ui-kit";
import { IntlProvider, useIntl } from "react-intl";
import { createRoot } from "react-dom/client";
import { useCallback, useRef, useState } from "react";
import type { RenderSettingsUiRequest } from "@canva/intents/content";
import { SettingsUi } from "../src/intents/content_publisher/settings_ui";
import { publishToPortfolio } from "../src/intents/content_publisher/publish";
import "@canva/app-ui-kit/styles.ltr.css";

type Settings = Parameters<RenderSettingsUiRequest["updatePublishSettings"]>[0];
type Listener = Parameters<
  RenderSettingsUiRequest["registerOnContextChange"]
>[0];
const designToken = `test.${btoa(JSON.stringify({ designId: "test-design" })).replace(/=/g, "")}.signature`;
const outputType = {
  id: "portfolio",
  displayName: "Portfolio",
  mediaSlots: [],
};

function CanvaHost() {
  const intl = useIntl();
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const listener = useRef<Listener | undefined>(undefined);
  const updateSettings = useCallback<
    RenderSettingsUiRequest["updatePublishSettings"]
  >(async (value) => {
    setSettings(value);
    return { status: "completed" };
  }, []);
  const register = useCallback((value: Listener) => {
    listener.current = value;
    return () => {
      listener.current = undefined;
    };
  }, []);
  const publish = async () => {
    setPublishing(true);
    setError("");
    try {
      const result = await publishToPortfolio(
        {
          publishRef: settings?.publishRef,
          outputType,
          outputMedia: [
            {
              mediaSlotId: "media",
              files: [
                {
                  format: "png",
                  url: "https://export-download.canva.com/test.png",
                  widthPx: 2,
                  heightPx: 3,
                  contentMetadata: {
                    type: "design",
                    title: "Portfolio design",
                    designToken,
                    pages: [{ pageNumber: 1, pageId: "test-page" }],
                  },
                },
              ],
            },
          ],
        },
        window.location.origin,
      );
      if (result.status === "app_error") {
        if (result.appDefinedPayload)
          listener.current?.onContextChange({
            reason: "publish_error",
            error: result,
          });
        else setError(result.message);
      }
    } finally {
      setPublishing(false);
    }
  };
  return (
    <TestAppUiProvider>
      <SettingsUi
        backendHost={window.location.origin}
        invocationContext={{ reason: "publish" }}
        updatePublishSettings={updateSettings}
        registerOnContextChange={register}
      />
      <Button
        variant="primary"
        disabled={publishing || settings?.validityState !== "valid"}
        onClick={() => void publish()}
      >
        {intl.formatMessage({
          defaultMessage: "Publish design",
          description: "Simulated Canva publish button",
        })}
      </Button>
      {error && <p role="alert">{error}</p>}
    </TestAppUiProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing Canva host root");
createRoot(root).render(
  <IntlProvider locale="en" messages={{}}>
    <CanvaHost />
  </IntlProvider>,
);
