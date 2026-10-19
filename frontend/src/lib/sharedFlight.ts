// "Foto que viaja": a foto e o código saem da linha da lista e pousam na ficha.
// Mede onde estavam na linha e onde ficam na ficha e anima uma cópia do destino entre os
// dois pontos (transform). Sem layoutId, para continuar no pacote leve do motion.
import { EASE_OUT, type MotionLevel } from "./motion";

type Part = "thumb" | "code";
const PARTS: Part[] = ["thumb", "code"];

type Pending = { productId: number; rects: Partial<Record<Part, DOMRect>>; at: number };
let pending: Pending | null = null;
// Miniatura da linha clicada: a ficha mostra ela enquanto a foto grande carrega.
let lastThumb: { productId: number; base64: string } | null = null;

/** Guarda onde a foto e o código estão na linha clicada (data-shared="thumb" | "code"). */
export function captureFlight(row: HTMLElement | null, productId: number) {
  pending = null;
  if (!row) return;
  const src = row.querySelector<HTMLImageElement>('[data-shared="thumb"] img')?.src ?? "";
  const base64 = src.startsWith("data:") ? src.slice(src.indexOf(",") + 1) : "";
  lastThumb = base64 ? { productId, base64 } : null;
  const rects: Partial<Record<Part, DOMRect>> = {};
  for (const part of PARTS) {
    const node = row.querySelector<HTMLElement>(`[data-shared="${part}"]`);
    const rect = node?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) rects[part] = rect;
  }
  if (rects.thumb || rects.code) pending = { productId, rects, at: Date.now() };
}

export function clearFlight() {
  pending = null;
}

/** A miniatura que estava na linha deste produto, se houver. */
export function rowThumbFor(productId: number): string | null {
  return lastThumb && lastThumb.productId === productId ? lastThumb.base64 : null;
}

const EASING = `cubic-bezier(${EASE_OUT.join(",")})`;

/**
 * Faz a viagem até os elementos data-shared-target dentro de `root`. Só no nível "completo"
 * e logo depois do clique (até 1,5 s); senão não faz nada.
 */
export function playFlight(root: HTMLElement | null, productId: number, level: MotionLevel): boolean {
  const flight = pending;
  if (!flight || flight.productId !== productId) return false;
  if (!root || level !== "completo" || Date.now() - flight.at > 1500) {
    pending = null;
    return false;
  }
  if (typeof Element.prototype.animate !== "function") {
    pending = null;
    return false;
  }
  let played = false;
  for (const part of PARTS) {
    const from = flight.rects[part];
    const target = root.querySelector<HTMLElement>(`[data-shared-target="${part}"]`);
    if (!from || !target) continue;
    const to = target.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) continue;
    const ghost = target.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-shared-target");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: "0",
      zIndex: "1000",
      pointerEvents: "none",
      transformOrigin: "0 0",
    });
    document.body.appendChild(ghost);
    target.style.visibility = "hidden";
    // A foto é quadrada: escala igual nos dois eixos. O código mantém a proporção do texto.
    const scaleX = from.width / to.width;
    const scaleY = part === "thumb" ? from.height / to.height : scaleX;
    const dx = from.left - to.left;
    const dy = from.top - to.top + (part === "code" ? (from.height - to.height * scaleY) / 2 : 0);
    const animation = ghost.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` },
        { transform: "translate(0, 0) scale(1, 1)" },
      ],
      { duration: part === "thumb" ? 560 : 520, easing: EASING },
    );
    const finish = () => {
      target.style.visibility = "";
      ghost.remove();
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    played = true;
  }
  pending = null;
  return played;
}
