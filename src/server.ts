import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { startLanguageDetector } from "~/languageDetector";

// Before the server listens: invalid LANGUAGE_DETECTOR* settings or a failed preload stop it.
await startLanguageDetector();

export default { fetch: createStartHandler(defaultStreamHandler) };
