import { Button, Group, Stack, Text } from "@mantine/core";
import { IconPackageOff } from "@tabler/icons-react";
import React from "react";

type EmptyStateProps = {
  message: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Botão principal (ex.: "Cadastrar esta peça"), antes do actionLabel. */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Desenho no lugar do ícone: lupa sobre uma caixa vazia. */
  illustrated?: boolean;
};

// Lupa sobre uma caixa aberta; a lupa flutua devagar (só fora do nível "Nenhum").
function SearchIllustration() {
  return (
    <svg className="mi-empty-art" width="132" height="96" viewBox="0 0 132 96" aria-hidden>
      <ellipse cx="66" cy="88" rx="44" ry="5" fill="var(--pill-track)" />
      <path d="M26 46 L66 34 L106 46 L66 58 Z" fill="var(--accent-soft)" stroke="var(--border-strong)" />
      <path d="M26 46 V74 L66 86 V58 Z" fill="var(--surface-raised)" stroke="var(--border-strong)" />
      <path d="M106 46 V74 L66 86 V58 Z" fill="var(--surface-2, var(--surface-raised))" stroke="var(--border-strong)" />
      <path d="M26 46 L14 34 L54 24 L66 34 Z" fill="var(--surface-raised)" stroke="var(--border-strong)" />
      <g className="mi-empty-lens">
        <circle cx="92" cy="26" r="13" fill="var(--surface-solid)" stroke="var(--accent)" strokeWidth="3" />
        <path d="M86 22 a7 7 0 0 1 8 -3" stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        <path d="M101 35 L112 46" stroke="var(--accent)" strokeWidth="4.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function EmptyState({
  message,
  description,
  icon,
  actionLabel,
  onAction,
  primaryLabel,
  onPrimary,
  illustrated = false,
}: EmptyStateProps) {
  return (
    <Stack gap={6} align="center" py="xl" px="md" className="empty-state">
      {illustrated ? (
        <SearchIllustration />
      ) : (
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
      )}

      <Text fw={600} size="md" ta="center" c="var(--text)">
        {message}
      </Text>

      {description && (
        <Text c="dimmed" size="sm" ta="center" maw={400}>
          {description}
        </Text>
      )}

      {(primaryLabel && onPrimary) || (actionLabel && onAction) ? (
        <Group gap="xs" mt={6} justify="center">
          {primaryLabel && onPrimary ? (
            <Button size="xs" onClick={onPrimary}>
              {primaryLabel}
            </Button>
          ) : null}
          {actionLabel && onAction ? (
            <Button size="xs" variant="default" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </Group>
      ) : null}
    </Stack>
  );
}
