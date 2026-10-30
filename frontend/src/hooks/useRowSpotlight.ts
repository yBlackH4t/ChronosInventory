import { useEffect, type RefObject } from "react";

/**
 * Holofote das tabelas (2.7.25): uma faixa desliza com mola até a linha onde está o mouse.
 * `container` precisa de position: relative (classe vv-spot-host); a faixa é criada aqui
 * dentro dele e as linhas são achadas por `rowSelector`.
 */
export function useRowSpotlight(container: RefObject<HTMLElement | null>, rowSelector: string) {
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    host.classList.add("vv-spot-host");
    const spot = document.createElement("span");
    spot.className = "vv-spot";
    spot.setAttribute("aria-hidden", "true");
    host.append(spot);
    let current: Element | null = null;

    const onMove = (event: PointerEvent) => {
      const row = (event.target as Element | null)?.closest?.(rowSelector) ?? null;
      if (!row || !host.contains(row)) {
        spot.removeAttribute("data-on");
        current = null;
        return;
      }
      if (row === current) return;
      current = row;
      const hostBox = host.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      spot.style.top = `${rowBox.top - hostBox.top + host.scrollTop - host.clientTop}px`;
      spot.style.height = `${rowBox.height}px`;
      spot.setAttribute("data-on", "");
    };
    const onLeave = () => {
      spot.removeAttribute("data-on");
      current = null;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      spot.remove();
      host.classList.remove("vv-spot-host");
    };
  }, [container, rowSelector]);
}
