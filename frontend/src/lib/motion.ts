// Níveis de animação (Configurações > Aparência). Lógica pura, sem React, para testar.
//
// - "completo": tudo: fundo que se move, cartões que entram com desfoque, troca de tela
//   deslizando, números que rolam, cartão que sobe no mouse, ponto de status pulsando;
// - "suave": só esmaecer (opacidade), rápido. Nada se desloca, o fundo fica parado e os
//   números trocam sem rolar. O vidro (desfoque) continua;
// - "nenhum": sem animação nenhuma e sem o desfoque do vidro (cartões opacos), para PCs
//   fracos.
//
// "Diminuir animações" do Windows (prefers-reduced-motion): o "completo" vira "suave".
// Quem escolheu "nenhum" continua com "nenhum"; ninguém ganha mais movimento do que pediu.

export type MotionLevel = "completo" | "suave" | "nenhum";

export const MOTION_LEVELS: readonly MotionLevel[] = ["completo", "suave", "nenhum"];

export const DEFAULT_MOTION_LEVEL: MotionLevel = "completo";

export function isMotionLevel(value: unknown): value is MotionLevel {
  return typeof value === "string" && (MOTION_LEVELS as readonly string[]).includes(value);
}

/** Nível que vale de fato, juntando a escolha do usuário e o ajuste do sistema. */
export function resolveMotionLevel(
  choice: unknown,
  prefersReducedMotion: boolean,
): MotionLevel {
  const level = isMotionLevel(choice) ? choice : DEFAULT_MOTION_LEVEL;
  if (level === "completo" && prefersReducedMotion) return "suave";
  return level;
}

/** Curva das animações do estilo Vidro suave (sai rápido e assenta devagar). */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

type PageTransition = {
  initial: Record<string, number>;
  animate: Record<string, number>;
  exit: Record<string, number>;
  enterDuration: number;
  exitDuration: number;
};

/** Troca de tela/aba: esmaece e desliza um pouco no "completo"; só esmaece no "suave". */
export function pageTransitionFor(level: MotionLevel): PageTransition | null {
  if (level === "nenhum") return null;
  if (level === "suave") {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      enterDuration: 0.18,
      exitDuration: 0.08,
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    enterDuration: 0.25,
    exitDuration: 0.1,
  };
}
