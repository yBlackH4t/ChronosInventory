import { Button, Stack, Text, ThemeIcon, Box } from "@mantine/core";
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
    <Stack gap="sm" align="center" py="xl" px="md">
      <Box
        style={{
          background: "var(--surface-muted)",
          padding: "1rem",
          borderRadius: "50%",
          boxShadow: "0 0 0 1px var(--line-soft), 0 8px 16px rgba(0,0,0,0.1)",
        }}
        mb="sm"
      >
        <ThemeIcon size={64} radius="50%" variant="light" color="gray">
          {icon || <IconPackageOff size={32} stroke={1.5} />}
        </ThemeIcon>
      </Box>

      <Text fw={700} size="lg" ta="center">
        {message}
      </Text>

      {description && (
        <Text c="dimmed" size="sm" ta="center" maw={400} mb="xs">
          {description}
        </Text>
      )}

      {actionLabel && onAction ? (
        <Button size="sm" variant="light" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
