import { EASE_OUT, type MotionLevel } from "./motion";

// Como cada pedaço do Painel aparece ao abrir, conforme o nível de animação
// (Configurações > Aparência). Lógica pura, sem React, para testar.
//
// - "completo": barras crescem, linhas se desenham, o ponteiro do medidor gira, a linha
//   nova da atividade desce do topo;
// - "suave": tudo só esmaece, rápido, sem nada se mexer de lugar;
// - "nenhum": já aparece pronto (initial = false).

export type RevealKind = "grow-y" | "grow-x" | "draw" | "slide" | "fade";

export type Reveal = {
  /** `false` = sem animação: o motion começa já no estado final. */
  initial: Record<string, number> | false;
  transition: { duration: number; delay: number; ease: [number, number, number, number] | "easeOut" };
};

const FROM: Record<RevealKind, Record<string, number>> = {
  "grow-y": { scaleY: 0 },
  "grow-x": { scaleX: 0 },
  draw: { pathLength: 0 },
  slide: { opacity: 0, y: -14 },
  fade: { opacity: 0 },
};

const DURATION: Record<RevealKind, number> = {
  "grow-y": 0.6,
  "grow-x": 0.7,
  draw: 1.0,
  slide: 0.4,
  fade: 0.35,
};

/** `index` escalona itens de uma lista (barras, linhas do ranking). */
export function revealFor(level: MotionLevel, kind: RevealKind, index = 0, baseDelay = 0): Reveal {
  if (level === "nenhum") {
    return { initial: false, transition: { duration: 0, delay: 0, ease: "easeOut" } };
  }
  if (level === "suave") {
    return {
      initial: { opacity: 0 },
      transition: { duration: 0.2, delay: Math.min(index * 0.02, 0.12), ease: "easeOut" },
    };
  }
  const step = kind === "grow-x" ? 0.08 : 0.05;
  return {
    initial: FROM[kind],
    transition: {
      duration: DURATION[kind],
      delay: baseDelay + Math.min(index * step, 0.6),
      ease: EASE_OUT,
    },
  };
}
