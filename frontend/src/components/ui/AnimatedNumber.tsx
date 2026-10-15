import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";

type AnimatedNumberProps = {
  value: number;
  durationMs?: number;
  format?: (value: number) => string;
};

const defaultFormat = (value: number) => value.toLocaleString("pt-BR");

// Quando o número muda (uma baixa por NF, por exemplo), ele corre até o valor novo,
// e fica claro que mudou. Sem animação para quem pediu menos movimento no Windows.
export default function AnimatedNumber({
  value,
  durationMs = 600,
  format = defaultFormat,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (reduceMotion || from === value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduceMotion]);

  return <span className="num">{format(shown)}</span>;
}
