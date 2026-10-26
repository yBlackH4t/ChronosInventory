import { m } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT, pageTransitionFor } from "../lib/motion";
import { useMotionLevel } from "../lib/motionContext";

// Troca de tela: esmaece e desliza um pouco (~250 ms) no nível "completo", só esmaece no
// "suave" e troca seco no "nenhum" (Configurações > Aparência).
export default function PageTransition({ children }: { children: ReactNode }) {
  const transition = pageTransitionFor(useMotionLevel());

  if (!transition) {
    return <div style={{ height: "100%", width: "100%" }}>{children}</div>;
  }

  return (
    <m.div
      initial={transition.initial}
      animate={{
        ...transition.animate,
        transition: { duration: transition.enterDuration, ease: EASE_OUT },
      }}
      exit={{
        ...transition.exit,
        transition: { duration: transition.exitDuration, ease: "easeIn" },
      }}
      style={{ height: "100%", width: "100%" }}
    >
      {children}
    </m.div>
  );
}
