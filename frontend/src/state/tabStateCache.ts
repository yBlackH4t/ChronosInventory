const MEMORY_CACHE = new Map<string, unknown>();
const STORAGE_PREFIX = "chronos.tab_state.v1.";

function storageKey(tabId: string): string {
  return `${STORAGE_PREFIX}${tabId}`;
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

export function loadTabState<T>(tabId: string): T | null {
  if (MEMORY_CACHE.has(tabId)) {
    return MEMORY_CACHE.get(tabId) as T;
  }

  if (!isStorageAvailable()) return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(tabId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    MEMORY_CACHE.set(tabId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveTabState<T>(tabId: string, state: T): void {
  MEMORY_CACHE.set(tabId, state);

  if (!isStorageAvailable()) return;
  try {
    window.sessionStorage.setItem(storageKey(tabId), JSON.stringify(state));
  } catch {
    // Best effort cache only.
  }
}

export function clearTabState(tabId: string): void {
  MEMORY_CACHE.delete(tabId);
  if (!isStorageAvailable()) return;
  try {
    window.sessionStorage.removeItem(storageKey(tabId));
  } catch {
    // ignore
  }
}
