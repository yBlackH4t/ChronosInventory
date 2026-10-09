import { Button, Stack, Text } from "@mantine/core";
import { IconPackageOff } from "@tabler/icons-react";
import React from "react";

type EmptyStateProps = {
  message: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({
  message,
  description,
  icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Stack gap={6} align="center" py="xl" px="md" className="empty-state">
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: "var(--surface-2)",
          color: "var(--text-subtle)",
          marginBottom: 6,
        }}
      >
        {icon || <IconPackageOff size={22} stroke={1.5} />}
      </div>

      <Text fw={600} size="md" ta="center" c="var(--text)">
        {message}
      </Text>

      {description && (
        <Text c="dimmed" size="sm" ta="center" maw={400}>
          {description}
        </Text>
      )}

      {actionLabel && onAction ? (
        <Button size="xs" variant="default" mt={6} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
