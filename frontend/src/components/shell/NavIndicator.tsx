import { useLayoutEffect, useState } from "react";
import { m } from "motion/react";
import { useMotionLevel } from "../../lib/motionContext";

type Box = { x: number; width: number };

// Pílula branca que desliza até a aba ativa da navegação principal. Mede a aba marcada
// com data-active dentro do trilho (sem layoutId: assim basta o pacote leve domAnimation).
export default function NavIndicator({
  track,
  activeKey,
}: {
  /** O trilho (nav); vem de um ref de callback, para a medida esperar ele existir. */
  track: HTMLElement | null;
  activeKey: string;
}) {
  const level = useMotionLevel();
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    if (!track) return;
    const measure = () => {
      const tab = track.querySelector<HTMLElement>("[data-active]");
      setBox((previous) => {
        if (!tab) return null;
        const next = { x: tab.offsetLeft, width: tab.offsetWidth };
        return previous && previous.x === next.x && previous.width === next.width
          ? previous
          : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    // A fonte embutida chega depois do primeiro desenho e muda a largura das abas.
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [track, activeKey]);

  if (!box) return null;

  // initial={false}: na primeira medida a pílula já aparece no lugar; depois desliza.
  const slide = level === "completo";
  return (
    <m.span
      aria-hidden="true"
      className="topnav-indicator"
      initial={false}
      animate={{ x: box.x, width: box.width }}
      transition={
        slide
          ? { type: "spring", stiffness: 520, damping: 42, mass: 0.9 }
          : { duration: 0 }
      }
    />
  );
}
