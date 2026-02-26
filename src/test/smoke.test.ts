import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs a basic test", () => {
    expect(1 + 1).toBe(2);
  });

  it("has jsdom environment", () => {
    expect(typeof document).toBe("object");
    expect(document.createElement("div")).toBeTruthy();
  });
});
