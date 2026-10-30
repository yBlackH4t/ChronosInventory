import type { ReactNode } from "react";
import { Group, Stack, Text, Title } from "@mantine/core";

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

// Um cabeçalho só em todas as telas: título, uma frase e as ações à direita.
export default function PageHeader({
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
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
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
