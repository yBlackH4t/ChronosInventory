import type { ReactNode } from "react";
import { Card, Group, Stack, Text } from "@mantine/core";

type PanelProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Removes inner padding so tables can run edge to edge. */
  flush?: boolean;
};

// Standard content block: a quiet title row above a bordered surface.
export default function Panel({
  title,
  subtitle,
  actions,
  children,
  flush = false,
}: PanelProps) {
  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <Card p={0} style={{ overflow: "hidden" }}>
      {hasHeader && (
        <Group
          justify="space-between"
          align="flex-start"
          wrap="wrap"
          gap="sm"
          px="lg"
          pt="md"
          pb={flush ? "md" : 0}
          style={flush ? { borderBottom: "1px solid var(--border)" } : undefined}
        >
          <Stack gap={2} miw={0}>
            {title && (
              <Text fw={600} size="sm">
                {title}
              </Text>
            )}
            {subtitle && (
              <Text size="xs" c="dimmed">
                {subtitle}
              </Text>
            )}
          </Stack>
          {actions ? <Group gap="xs">{actions}</Group> : null}
        </Group>
      )}
      <div style={flush ? undefined : { padding: "var(--mantine-spacing-md) var(--mantine-spacing-lg) var(--mantine-spacing-lg)" }}>
        {children}
      </div>
    </Card>
  );
}
