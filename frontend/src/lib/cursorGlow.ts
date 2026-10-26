import type { PointerEvent } from "react";

/** Guarda a posição do mouse no cartão (--mx/--my) para o holofote do CSS (.mi-glow). */
export function trackCursorGlow(event: PointerEvent<HTMLElement>): void {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  el.style.setProperty("--my", `${event.clientY - rect.top}px`);
}
