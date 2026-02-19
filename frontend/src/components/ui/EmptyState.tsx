import { Button, Stack, Text } from "@mantine/core";

type EmptyStateProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Stack gap="xs" align="center" py="sm">
      <Text className="empty-state" ta="center">
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button size="xs" variant="light" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
