import { expect, test } from "@playwright/test";

const GOOGLE_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

test("serves Inter from local production assets", async ({ baseURL, request }) => {
  if (!baseURL) throw new Error("Playwright baseURL is not configured");

  const pageResponse = await request.get("/");
  expect(pageResponse.ok()).toBe(true);

  const html = await pageResponse.text();
  for (const host of GOOGLE_FONT_HOSTS) {
    expect(html).not.toContain(host);
  }

  const stylesheetHref = /href="([^"]+\.css)"/.exec(html)?.[1];
  expect(stylesheetHref, "the production page should link its compiled stylesheet").toBeTruthy();
  if (!stylesheetHref) throw new Error("Compiled stylesheet link was not found");

  const stylesheetUrl = new URL(stylesheetHref, baseURL);
  expect(stylesheetUrl.origin).toBe(new URL(baseURL).origin);

  const stylesheetResponse = await request.get(stylesheetUrl.toString());
  expect(stylesheetResponse.ok()).toBe(true);

  const css = await stylesheetResponse.text();
  expect(css).toMatch(/font-family:\s*["']?Inter Variable["']?/);
  expect(css).toMatch(/--font-sans:\s*["']?Inter Variable["']?/);
  for (const host of GOOGLE_FONT_HOSTS) {
    expect(css).not.toContain(host);
  }

  const fontPaths = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((match) =>
    (match[1] ?? "").replaceAll(/["']/g, "").trim()
  );
  const interFontPath = fontPaths.find((path) => path.includes("inter-"));
  expect(
    interFontPath,
    "the compiled stylesheet should reference a local Inter WOFF2"
  ).toBeTruthy();
  if (!interFontPath) throw new Error("Compiled Inter WOFF2 reference was not found");

  const fontUrl = new URL(interFontPath, stylesheetUrl);
  expect(fontUrl.origin).toBe(new URL(baseURL).origin);

  const fontResponse = await request.get(fontUrl.toString());
  expect(fontResponse.ok()).toBe(true);
  expect(fontResponse.headers()["content-type"]).toContain("font/woff2");

  const fontBytes = await fontResponse.body();
  expect(fontBytes.byteLength).toBeGreaterThan(4);
  expect(fontBytes.subarray(0, 4).toString("ascii")).toBe("wOF2");
});
