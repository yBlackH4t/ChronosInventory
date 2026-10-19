import { m } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

import { useMotionLevel } from "../../lib/motionContext";
import { revealFor, type RevealOptions } from "../../lib/reveal";

type RevealProps = RevealOptions & {
  /** Posição na sequência: 0 entra primeiro. */
  index: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

// Bloco que entra em sequência (ver lib/reveal.ts). Só anima ao aparecer pela primeira vez.
export default function Reveal({ index, children, className, style, ...options }: RevealProps) {
  const reveal = revealFor(useMotionLevel(), index, options);
  if (!reveal) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <m.div
      className={className}
      style={style}
      initial={reveal.initial}
      animate={reveal.animate}
      transition={reveal.transition}
    >
      {children}
    </m.div>
  );
}
