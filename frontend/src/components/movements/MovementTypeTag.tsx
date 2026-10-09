import { Group, Text } from "@mantine/core";
import type { MovementOut } from "../../lib/api";
import { movementColor } from "../../lib/movements";

const TYPE_LABELS: Record<MovementOut["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

// Dot + label: identity by color and text, never color alone.
export default function MovementTypeTag({ tipo }: { tipo: MovementOut["tipo"] }) {
  return (
    <Group gap={6} wrap="nowrap">
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          flexShrink: 0,
          background: `var(--mantine-color-${movementColor(tipo)}-filled)`,
        }}
      />
      <Text size="sm" fw={500}>
        {TYPE_LABELS[tipo] ?? tipo}
      </Text>
    </Group>
  );
}
