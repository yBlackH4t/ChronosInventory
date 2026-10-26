import { flushSync } from "react-dom";

import type { MotionLevel } from "./motion";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

/**
 * Troca claro/escuro com um círculo que se abre a partir do botão clicado (só no nível
 * "Completo" e se o WebView tiver View Transitions); senão troca direto.
 */
export function revealThemeChange(
  origin: { clientX: number; clientY: number } | null,
  apply: () => void,
  level: MotionLevel,
): void {
  const doc = document as ViewTransitionDocument;
  if (level !== "completo" || !doc.startViewTransition || !origin) {
    apply();
    return;
  }
  const { clientX: x, clientY: y } = origin;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  root.style.setProperty("--mi-reveal-x", `${x}px`);
  root.style.setProperty("--mi-reveal-y", `${y}px`);
  root.style.setProperty("--mi-reveal-r", `${Math.ceil(radius)}px`);
  doc.startViewTransition(() => {
    flushSync(apply);
  });
}
