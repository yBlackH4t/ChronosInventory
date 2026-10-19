import { type RefObject, useLayoutEffect, useRef } from "react";

import { planFlip } from "../lib/flip";
import { EASE_OUT } from "../lib/motion";
import { useMotionLevel } from "../lib/motionContext";

const EASING = `cubic-bezier(${EASE_OUT.join(",")})`;

/** Topo na página sem contar transform (animações em curso não atrapalham a medida). */
function pageTop(node: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

/**
 * Anima as linhas marcadas com data-flip-key dentro de `container` quando `signature`
 * muda (ex.: os ids da lista). Mede a cada desenho (as linhas virtualizadas entram e saem
 * com a rolagem), mas só anima quando a lista mudou; na primeira medida não anima nada.
 */
export function useFlipList(
  container: RefObject<HTMLElement | null>,
  signature: string,
  options: { enterOffset?: number } = {},
) {
  const level = useMotionLevel();
  const previous = useRef<Map<string, number> | null>(null);
  const lastSignature = useRef<string | null>(null);
  const enterOffset = options.enterOffset ?? 6;

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-flip-key]");
    const next = new Map<string, number>();
    const byKey = new Map<string, HTMLElement>();
    nodes.forEach((node) => {
      const key = node.dataset.flipKey;
      if (!key) return;
      // Relativo ao bloco animado de fora (ex.: o dia), para não deslizar duas vezes.
      const outer = node.parentElement?.closest<HTMLElement>("[data-flip-key]");
      const base = outer && root.contains(outer) ? pageTop(outer) : pageTop(root);
      next.set(key, pageTop(node) - base);
      byKey.set(key, node);
    });
    const before = previous.current;
    const changed = lastSignature.current !== null && lastSignature.current !== signature;
    previous.current = next;
    lastSignature.current = signature;
    // Sem mudança na lista (rolagem, mouse): só guarda as posições atuais.
    if (!changed || !before || typeof Element.prototype.animate !== "function") return;

    for (const step of planFlip(before, next, level)) {
      const node = byKey.get(step.key);
      if (!node) continue;
      if (step.kind === "move") {
        node.animate(
          [{ transform: `translateY(${step.dy}px)` }, { transform: "translateY(0)" }],
          { duration: 300, easing: EASING },
        );
      } else {
        const slide = level === "completo" && enterOffset !== 0;
        node.animate(
          slide
            ? [
                { opacity: 0, transform: `translateY(${-enterOffset}px)` },
                { opacity: 1, transform: "translateY(0)" },
              ]
            : [{ opacity: 0 }, { opacity: 1 }],
          { duration: slide ? 320 : 200, easing: EASING },
        );
      }
    }
  });
}
