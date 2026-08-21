import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    "https://attacker.example/phish",
    "//attacker.example/phish",
    "/\\attacker.example/phish",
    "javascript:alert(1)",
    "\u0000/appointments",
  ])("refuses an external or ambiguous continuation: %s", (target) => {
    expect(safeRedirectPath(target)).toBe("/");
  });

  it("preserves a legitimate local path, query, and fragment", () => {
    expect(safeRedirectPath("/appointments?view=week#today")).toBe("/appointments?view=week#today");
  });
});
