import type { ReactNode } from "react";
import { Group, Text } from "@mantine/core";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_COLOR: Record<StatusTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--mantine-color-blue-filled)",
  neutral: "var(--text-subtle)",
};

type StatusDotProps = {
  tone?: StatusTone;
  children: ReactNode;
  size?: "xs" | "sm";
  dimmed?: boolean;
};

// Status as dot + label: meaning never relies on color alone.
export default function StatusDot({
  tone = "neutral",
  children,
  size = "sm",
  dimmed = false,
}: StatusDotProps) {
  return (
    <Group gap={6} wrap="nowrap">
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          flexShrink: 0,
          background: TONE_COLOR[tone],
        }}
      />
      <Text size={size} c={dimmed ? "dimmed" : undefined}>
        {children}
      </Text>
    </Group>
  );
}

type KeyValueProps = {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
};

// Label on the left, value on the right; used for compact detail lists.
export function KeyValue({ label, value, mono = false }: KeyValueProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md" py={6}>
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text
        size="sm"
        fw={500}
        ta="right"
        truncate="end"
        className={mono ? "mono" : "num"}
      >
        {value}
      </Text>
    </Group>
  );
}
