import { createContext, useContext } from "react";
import { DEFAULT_MOTION_LEVEL, type MotionLevel } from "./motion";

/** Nível de animação que vale agora (escolha + "Diminuir animações" do Windows). */
export const MotionLevelContext = createContext<MotionLevel>(DEFAULT_MOTION_LEVEL);

export function useMotionLevel(): MotionLevel {
  return useContext(MotionLevelContext);
}
