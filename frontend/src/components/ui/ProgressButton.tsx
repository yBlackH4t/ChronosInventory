import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "@mantine/core";
import DrawnCheck from "./DrawnCheck";

type ProgressButtonProps = Omit<ButtonProps, "loading"> & {
  /** Trabalhando: uma faixa enche o botão por dentro e o texto vira `busyLabel`. */
  busy: boolean;
  /** Terminou sem erro? Se sim, o botão mostra um ✓ e volta ao normal. */
  failed?: boolean;
  busyLabel?: string;
  doneLabel?: string;
  onClick?: () => void;
  type?: "button" | "submit";
};

const DONE_MS = 1500;

// Botão de ação demorada (Publicar base, Buscar nota, Gerar PDF): progresso dentro do
// botão, ✓ animado no fim e volta ao normal. No nível "Nenhum" a faixa fica parada.
export default function ProgressButton({
  busy,
  failed = false,
  busyLabel,
  doneLabel = "Pronto",
  children,
  disabled,
  className,
  ...rest
}: ProgressButtonProps) {
  const [done, setDone] = useState(false);
  const [prevBusy, setPrevBusy] = useState(busy);

  // Acabou de terminar (busy: true -> false) sem erro: mostra o ✓.
  if (busy !== prevBusy) {
    setPrevBusy(busy);
    setDone(!busy && !failed);
  }

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <Button
      {...rest}
      className={`mi-progress-btn ${className ?? ""}`}
      data-busy={busy || undefined}
      data-done={done || undefined}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={busy ? undefined : rest.onClick}
      leftSection={done ? <DrawnCheck /> : rest.leftSection}
    >
      <span aria-live="polite">{busy ? (busyLabel ?? children) : done ? doneLabel : children}</span>
    </Button>
  );
}
