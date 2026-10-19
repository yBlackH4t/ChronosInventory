import { VisuallyHidden } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

import { NFE_STEPS, nfeStepStatus } from "../../lib/nfeSteps";

// Indicador das etapas do "Lançar nota fiscal": ler a chave -> conferir itens -> confirmar.
export default function NfeStepper({ current }: { current: number }) {
  return (
    <ol className="nfe-steps" aria-label="Etapas do lançamento">
      {NFE_STEPS.map((step, index) => {
        const status = nfeStepStatus(index, current);
        return (
          <li
            key={step.label}
            className="nfe-step"
            data-status={status}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className="nfe-step-dot" aria-hidden>
              {status === "done" ? <IconCheck size={14} stroke={2.5} /> : index + 1}
            </span>
            <span className="nfe-step-text">
              <span className="nfe-step-label">
                {step.label}
                {status === "done" && <VisuallyHidden component="span"> (feito)</VisuallyHidden>}
              </span>
              <span className="nfe-step-hint">{step.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
