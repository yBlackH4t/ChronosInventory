import type { PointerEvent } from "react";

/** Guarda a posição do mouse no cartão (--mx/--my) para o holofote do CSS (.mi-glow). */
export function trackCursorGlow(event: PointerEvent<HTMLElement>): void {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  el.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

/**
 * Holofote + inclinação leve do cartão na direção do mouse (2.7.25). A inclinação só
 * acontece no nível "Completo"; `strength` é o ângulo máximo em graus.
 */
export function tiltWithCursor(event: PointerEvent<HTMLElement>, moving: boolean, strength = 8): void {
  trackCursorGlow(event);
  if (!moving) return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  el.style.transform = `perspective(700px) rotateX(${(-y * strength).toFixed(2)}deg) rotateY(${(x * strength * 1.25).toFixed(2)}deg)`;
}

/** Volta o cartão ao lugar quando o mouse sai. */
export function resetTilt(event: PointerEvent<HTMLElement>): void {
  event.currentTarget.style.transform = "";
}
