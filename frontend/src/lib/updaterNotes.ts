type ManifestLike = {
  body?: string | null;
  notes?: string | null;
};

export const DEFAULT_RELEASE_NOTES = "Sem release notes para esta versao.";

export function getReleaseNotesFromManifest(manifest?: ManifestLike | null): string {
  const body = typeof manifest?.body === "string" ? manifest.body : "";
  const notes = typeof manifest?.notes === "string" ? manifest.notes : "";
  const raw = (body || notes).replace(/\r\n/g, "\n").trim();
  if (!raw) return DEFAULT_RELEASE_NOTES;
  return raw;
}

export function getReleaseNotesPreview(notes: string, maxLength = 220): string {
  const compact = notes.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}
