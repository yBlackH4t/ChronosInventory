import type { ReactNode } from "react";
import { Group, Skeleton, Text, UnstyledButton } from "@mantine/core";

type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Small colored mark that ties the tile to a chart series or status. */
  accent?: string;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
};

// KPI tile: label, large neutral number, optional muted hint.
// Values stay in text ink; color only appears as the small accent mark.
export default function StatTile({
  label,
  value,
  hint,
  icon,
  accent,
  loading = false,
  active = false,
  onClick,
}: StatTileProps) {
  const body = (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={8} wrap="nowrap" miw={0}>
          {accent && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: accent,
                flexShrink: 0,
              }}
            />
          )}
          <Text size="xs" c="dimmed" fw={500} truncate="end">
            {label}
          </Text>
        </Group>
        {icon && (
          <span style={{ color: "var(--text-subtle)", display: "flex" }}>
            {icon}
          </span>
        )}
      </Group>
      {loading ? (
        <Skeleton h={30} w="60%" mt={8} radius="sm" />
      ) : (
        <Text fz={28} fw={650} lh={1.2} mt={6} truncate="end" lts="-0.02em">
          {value}
        </Text>
      )}
      {hint && (
        <Text size="xs" c="dimmed" mt={2} truncate="end">
          {hint}
        </Text>
      )}
    </>
  );

  if (onClick) {
    return (
      <UnstyledButton
        onClick={onClick}
        className="stat-tile"
        data-active={active || undefined}
        data-clickable
      >
        {body}
      </UnstyledButton>
    );
  }

  return <div className="stat-tile">{body}</div>;
}
