// Entrada em sequência (itens da nota, blocos da resposta do assistente). Lógica pura,
// sem React, para testar. Segue os níveis de Configurações > Aparência:
// - "completo": esmaece e sobe um pouco, um depois do outro;
// - "suave": só esmaece, também em sequência;
// - "nenhum": aparece de uma vez (sem animação).

import { EASE_OUT, type MotionLevel } from "./motion";

export type RevealOptions = {
  /** Intervalo entre um item e o próximo, em segundos. */
  step?: number;
  /** A partir deste item, os outros entram juntos (lista longa não fica esperando). */
  maxSteps?: number;
  /** Quanto o item sobe ao entrar, em px (só no "completo"). */
  distance?: number;
};

export type Reveal = {
  initial: { opacity: number; y?: number };
  animate: { opacity: number; y?: number };
  transition: { duration: number; delay: number; ease: [number, number, number, number] | "easeOut" };
};

export const REVEAL_STEP = 0.15;
export const REVEAL_MAX_STEPS = 8;

/** Atraso do item `index` na sequência (segundos). */
export function revealDelay(index: number, step = REVEAL_STEP, maxSteps = REVEAL_MAX_STEPS): number {
  const position = Math.max(0, Math.min(Math.floor(index), maxSteps));
  return Math.round(position * step * 1000) / 1000;
}

export function revealFor(level: MotionLevel, index: number, options: RevealOptions = {}): Reveal | null {
  if (level === "nenhum") return null;
  const { step = REVEAL_STEP, maxSteps = REVEAL_MAX_STEPS, distance = 6 } = options;
  const delay = revealDelay(index, step, maxSteps);
  if (level === "suave") {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.18, delay, ease: "easeOut" },
    };
  }
  return {
    initial: { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, delay, ease: EASE_OUT },
  };
}
