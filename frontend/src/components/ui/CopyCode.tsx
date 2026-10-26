import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { IconCheck } from "@tabler/icons-react";

type CopyCodeProps = {
  code: string;
} & Omit<HTMLAttributes<HTMLButtonElement>, "onClick" | "children">;

// Código da peça que copia ao clicar: troca por um ✓ "Copiado" por um instante.
// Não abre a ficha (o clique para aqui).
export default function CopyCode({ code, className, ...rest }: CopyCodeProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      {...rest}
      className={`mi-copy ${className ?? ""}`}
      data-copied={copied || undefined}
      aria-label={copied ? `Código ${code} copiado` : `Copiar código ${code}`}
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span className="mi-copy-text">{code}</span>
      <span className="mi-copy-done" aria-hidden>
        <IconCheck size={13} stroke={2.6} /> Copiado
      </span>
    </button>
  );
}
