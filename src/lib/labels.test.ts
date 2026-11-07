import { describe, it, expect } from "vitest";
import { DEFAULT_LABELS } from "./labels";

describe("DEFAULT_LABELS", () => {
  it("has 12 label keys", () => {
    expect(Object.keys(DEFAULT_LABELS)).toHaveLength(12);
  });

  it("all values are non-empty strings", () => {
    for (const [key, value] of Object.entries(DEFAULT_LABELS)) {
      expect(value, `label "${key}" should be a non-empty string`).toBeTruthy();
      expect(typeof value).toBe("string");
    }
  });
});
