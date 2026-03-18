import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const fetch = createStartHandler(defaultStreamHandler);
const handler = Object.assign(fetch, { fetch });
export { fetch };
export default handler;