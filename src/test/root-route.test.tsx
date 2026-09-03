import { describe, expect, it } from "vitest";
import { Route } from "../routes/__root";

describe("root document", () => {
  it("does not load Google Fonts", async () => {
    const head = await Route.options.head?.({} as never);
    const googleFontOrigins = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];
    const googleFontLinks = head?.links?.filter((link) =>
      googleFontOrigins.some((origin) => link?.href?.startsWith(origin))
    );

    expect(googleFontLinks).toEqual([]);
  });
});
