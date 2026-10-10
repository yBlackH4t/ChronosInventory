import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELEASE_NOTES,
  getReleaseNotesFromManifest,
  getReleaseNotesPreview,
} from "./updaterNotes";

describe("notas de atualizacao", () => {
  it("usa body, depois notes, depois o texto padrao", () => {
    expect(getReleaseNotesFromManifest({ body: "a\r\nb" })).toBe("a\nb");
    expect(getReleaseNotesFromManifest({ notes: " c " })).toBe("c");
    expect(getReleaseNotesFromManifest(null)).toBe(DEFAULT_RELEASE_NOTES);
  });

  it("previa compacta espacos e corta com reticencias", () => {
    expect(getReleaseNotesPreview("a   b\n c")).toBe("a b c");
    expect(getReleaseNotesPreview("x".repeat(30), 10)).toBe("xxxxxxx...");
  });
});
