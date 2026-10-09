import type { ReactNode } from "react";
import { Text } from "@mantine/core";
import StatusDot, { type StatusTone } from "./StatusDot";

type StatusTileProps = {
  label: string;
  value: ReactNode;
  tone?: StatusTone;
  status?: ReactNode;
  hint?: ReactNode;
};

// Overview tile for system state: label, short value, status dot, muted hint.
export default function StatusTile({
  label,
  value,
  tone = "neutral",
  status,
  hint,
}: StatusTileProps) {
  return (
    <div className="stat-tile">
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      <Text fz={18} fw={650} mt={6} truncate="end">
        {value}
      </Text>
      {status ? (
        <div style={{ marginTop: 6 }}>
          <StatusDot tone={tone} size="xs" dimmed>
            {status}
          </StatusDot>
        </div>
      ) : null}
      {hint ? (
        <Text
          size="xs"
          c="dimmed"
          mt={4}
          truncate="end"
          title={typeof hint === "string" ? hint : undefined}
        >
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
