import type { MotionLevel } from "./motion";

const EXIT_MS = 260;

/**
 * Linha que sai da lista (produto excluído ou inativado): esmaece, encolhe e desliza um pouco
 * antes de a lista recarregar. Fora do nível "Completo" (ou sem a linha) resolve na hora.
 */
export function animateRowOut(selector: string, level: MotionLevel): Promise<void> {
  const row = document.querySelector<HTMLElement>(selector);
  if (!row || level !== "completo" || typeof row.animate !== "function") return Promise.resolve();
  const animation = row.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateX(-18px) scaleY(0.6)" },
    ],
    { duration: EXIT_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  );
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}
