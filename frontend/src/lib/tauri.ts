export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore
  if (window.__TAURI__ !== undefined) return true;
  // @ts-ignore
  if (window.__TAURI_INTERNALS__ !== undefined) return true;
  // @ts-ignore
  if (window.__TAURI_IPC__ !== undefined) return true;
  return navigator.userAgent.includes("tauri");
}
