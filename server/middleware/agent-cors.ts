import { getRequestURL, handleCors } from "h3";

export default defineEventHandler((event) => {
  if (
    !/^\/api\/agent\/(?:gather-requirements|clarify-requirements\/[^/]+)\/?$/.test(
      getRequestURL(event).pathname,
    )
  )
    return;
  const config = useRuntimeConfig(event);
  if (
    handleCors(event, {
      origin: [config.canvaAppOrigin],
      methods: ["POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  )
    return;
});
