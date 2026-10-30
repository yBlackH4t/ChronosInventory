import { useCallback, useState } from "react";
import { useMotionLevel } from "../../lib/motionContext";

type Job = { key: number; title: string; detail: string };

/** Quanto a etiqueta leva para "sair" antes de abrir a impressão de verdade. */
const PRINT_DELAY_MS = 900;

// Etiqueta "saindo da impressora" no canto da tela antes da impressão de verdade (2.7.25).
// Só no nível "Completo"; nos outros a impressão abre na hora, como antes.
export function usePrintOut() {
  const level = useMotionLevel();
  const [job, setJob] = useState<Job | null>(null);

  const print = useCallback(
    (title: string, detail: string, run: () => void) => {
      if (level !== "completo") {
        run();
        return;
      }
      const key = Date.now();
      setJob({ key, title, detail });
      window.setTimeout(run, PRINT_DELAY_MS);
      window.setTimeout(() => setJob((current) => (current?.key === key ? null : current)), 2600);
    },
    [level],
  );

  const node = job ? (
    <div key={job.key} className="vv-printout" role="status" aria-label={`Imprimindo ${job.title}`}>
      <div className="vv-printout-body">
        <span className="vv-printout-led" />
      </div>
      <div className="vv-printout-label">
        <b>{job.title}</b>
        <span>{job.detail}</span>
        <span className="vv-printout-bars" aria-hidden />
      </div>
    </div>
  ) : null;

  return { print, node };
}
