import { Skeleton, Stack } from "@mantine/core";
import CommandPanel from "./CommandPanel";
import type { SystemLine } from "../../../lib/commandCenter";

type SystemsBlockProps = {
  lines: SystemLine[];
  loading: boolean;
};

// Coluna da esquerda: se cada parte do Chronos está de pé. Só a luz verde pulsa.
export default function SystemsBlock({ lines, loading }: SystemsBlockProps) {
  return (
    <CommandPanel area="sys" title="Sistemas">
      {loading ? (
        <Stack gap={12}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} h={34} radius="sm" />
          ))}
        </Stack>
      ) : (
        <ul className="cc-systems">
          {lines.map((line) => (
            <li key={line.label}>
              <span className="cc-light" data-tone={line.tone} aria-hidden />
              <span>
                {line.label}
                <small className="cc-mono">{line.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </CommandPanel>
  );
}
