import { describe, expect, it } from "vitest";
import { projectKnowledgeWriteResult } from "./knowledge-result";

describe("Knowledge action result projection", () => {
  it("keeps an accepted local write successful when provider sync needs attention", () => {
    expect(projectKnowledgeWriteResult({
      state: "needs_attention",
      id: "kn_local",
      message: "Synchronization needs attention.",
    })).toEqual({
      ok: true,
      warning: "Synchronization needs attention.",
    });
  });

  it("projects ordinary and missing results without a warning", () => {
    expect(projectKnowledgeWriteResult({ state: "synced", id: "kn_local" })).toEqual({ ok: true });
    expect(projectKnowledgeWriteResult(null)).toEqual({ ok: true });
  });
});
