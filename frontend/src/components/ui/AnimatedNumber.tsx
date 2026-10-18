import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useMotionLevel } from "../../lib/motionContext";

type AnimatedNumberProps = {
  value: number;
};

// Números que rolam (dígito a dígito) quando mudam, como uma baixa por NF. No nível
// "Completo" eles também sobem do zero ao abrir a tela; em "Suave" e "Nenhum" trocam
// direto (Configurações > Aparência).
export default function AnimatedNumber({ value }: AnimatedNumberProps) {
  const animated = useMotionLevel() === "completo";
  const [shown, setShown] = useState(animated ? 0 : value);

  useEffect(() => {
    setShown(value);
  }, [value]);

  return (
    <NumberFlow
      value={animated ? shown : value}
      locales="pt-BR"
      animated={animated}
      className="num"
    />
  );
}
