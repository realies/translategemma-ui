import { defineConfig } from "@playwright/test";

const port = "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  reporter: "line",
  use: { baseURL },
  webServer: {
    command: "npm start",
    url: `${baseURL}/health`,
    env: {
      HOST: "127.0.0.1",
      PORT: port,
    },
    timeout: 30_000,
  },
});
