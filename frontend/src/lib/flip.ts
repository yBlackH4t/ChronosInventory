// Linhas que se reorganizam suavemente (busca ao vivo, movimentação nova no topo).
// Técnica FLIP: mede onde cada linha estava e onde ficou, e anima só a diferença com
// transform/opacity (barato, sem o pacote de layout do motion).
import type { MotionLevel } from "./motion";

export type FlipStep =
  | { key: string; kind: "move"; dy: number }
  | { key: string; kind: "enter" };

/** Acima disso, só as linhas novas aparecem (esmaecendo); nada desliza. */
export const FLIP_MAX_MOVES = 60;

/**
 * O que animar quando a lista muda. "nenhum": nada. "suave": só as linhas novas esmaecem.
 * "completo": as novas esmaecem e as que mudaram de lugar deslizam até a posição nova.
 */
export function planFlip(
  previous: ReadonlyMap<string, number>,
  next: ReadonlyMap<string, number>,
  level: MotionLevel,
): FlipStep[] {
  if (level === "nenhum") return [];
  const steps: FlipStep[] = [];
  const moves: FlipStep[] = [];
  for (const [key, top] of next) {
    const before = previous.get(key);
    if (before === undefined) {
      steps.push({ key, kind: "enter" });
    } else if (level === "completo" && Math.abs(before - top) >= 1) {
      moves.push({ key, kind: "move", dy: before - top });
    }
  }
  if (moves.length <= FLIP_MAX_MOVES) steps.push(...moves);
  return steps;
}
