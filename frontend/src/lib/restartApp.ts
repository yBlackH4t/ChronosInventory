import { isTauri } from "./tauri";

export async function restartApplication(): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      await invoke("restart_app");
      return;
    } catch {
      const process = await import("@tauri-apps/api/process");
      await process.relaunch();
      return;
    }
  }

  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

