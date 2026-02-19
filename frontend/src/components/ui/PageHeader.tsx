import type { ReactNode } from "react";
import { Group, Stack, Text, Title } from "@mantine/core";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="end" wrap="wrap">
      <Stack gap={2} className="page-header">
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text size="sm" className="page-subtitle">
            {subtitle}
          </Text>
        )}
      </Stack>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
