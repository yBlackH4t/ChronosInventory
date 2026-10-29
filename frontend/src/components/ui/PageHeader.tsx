import type { ReactNode } from "react";
import { Group, Stack, Text, Title } from "@mantine/core";
import type { Icon } from "@tabler/icons-react";

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Ícone animado ao lado do título (telas com o visual novo). */
  icon?: Icon;
};

export default function PageHeader({
  title,
  subtitle,
  actions,
  icon: HeaderIcon,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
      <Group gap="md" wrap="nowrap" align="center">
        {HeaderIcon && (
          <span className="ts-header-icon" aria-hidden="true">
            <HeaderIcon size={24} stroke={1.6} />
          </span>
        )}
        <Stack gap={2}>
          <Title order={2} className="page-header-title">
            {title}
          </Title>
          {subtitle && (
            <Text size="sm" className="page-subtitle">
              {subtitle}
            </Text>
          )}
        </Stack>
      </Group>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
