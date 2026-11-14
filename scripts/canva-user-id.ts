import { readFileSync } from "node:fs";
import { initUserTokenVerifier } from "@canva/app-middleware";

// Read from stdin, never from a command-line argument or a logged URL.
const token = readFileSync(0, "utf8").trim();
if (!token || token.length > 16384) {
  console.error("Provide a Canva user JWT on stdin.");
  process.exitCode = 1;
} else {
  try {
    const verifier = initUserTokenVerifier({
      appId: process.env.NUXT_CANVA_APP_ID || "AAHOGIFETu8",
      timeoutMs: 2500,
    });
    const { userId } = await verifier.verify(token);
    console.log(userId);
  } catch {
    console.error(
      "Could not verify the Canva user token. Obtain a fresh token from your Canva preview.",
    );
    process.exitCode = 1;
  }
}
