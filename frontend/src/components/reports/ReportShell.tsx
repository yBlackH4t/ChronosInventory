import type { ReactNode } from "react";
import { Badge, Card, Divider, Group, Stack, Text } from "@mantine/core";

type ReportShellProps = {
  title: string;
  description: ReactNode;
  /** Parameters of the report (dates, scope, item list...). */
  children?: ReactNode;
  /** Left side of the footer: hint text. */
  footerHint?: ReactNode;
  /** Right side of the footer: the generate button. */
  action: ReactNode;
};

// Shared frame for every report: what it is, its parameters, one action.
export default function ReportShell({
  title,
  description,
  children,
  footerHint,
  action,
}: ReportShellProps) {
  return (
    <Card p={0}>
      <Stack gap={4} px="lg" pt="lg" pb="md">
        <Group gap="xs">
          <Text fw={650} size="md">
            {title}
          </Text>
          <Badge size="xs" variant="default">
            PDF
          </Badge>
        </Group>
        <Text size="sm" c="dimmed" maw={640}>
          {description}
        </Text>
      </Stack>
      {children ? (
        <>
          <Divider color="var(--border)" />
          <div style={{ padding: "var(--mantine-spacing-lg)" }}>{children}</div>
        </>
      ) : null}
      <Divider color="var(--border)" />
      <Group justify="space-between" px="lg" py="sm" wrap="wrap" gap="sm">
        <Text size="xs" c="dimmed">
          {footerHint}
        </Text>
        {action}
      </Group>
    </Card>
  );
}
