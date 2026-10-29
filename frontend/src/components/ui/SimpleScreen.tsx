import { useState, type ReactNode } from "react";
import { Collapse, Stack, Text } from "@mantine/core";
import { IconChevronDown, type Icon } from "@tabler/icons-react";

type StatusPanelProps = {
  tone: "ok" | "atencao";
  icon: Icon;
  title: ReactNode;
  lines: ReactNode[];
};

/** Situação da tela em uma frase grande e algumas linhas curtas. */
export function StatusPanel({
  tone,
  icon: StatusIcon,
  title,
  lines,
}: StatusPanelProps) {
  return (
    <section className="ts-status" data-tone={tone} aria-live="polite">
      <span className="ts-status-badge" aria-hidden="true">
        <StatusIcon size={30} stroke={1.7} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="ts-status-title">{title}</div>
        <div className="ts-status-lines">
          {lines.map((line, index) => (
            <span key={index}>{line}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

type ActionTileProps = {
  icon: Icon;
  title: string;
  text: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: "perigo";
};

/** Botão grande: ícone, o que faz e uma frase curta. */
export function ActionTile({
  icon: TileIcon,
  title,
  text,
  onClick,
  loading,
  disabled,
  tone,
}: ActionTileProps) {
  return (
    <button
      type="button"
      className="ts-action"
      data-tone={tone}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className="ts-action-icon" aria-hidden="true">
        <TileIcon size={22} stroke={1.7} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="ts-action-title" style={{ display: "block" }}>
          {loading ? "Aguarde..." : title}
        </span>
        <span className="ts-action-text" style={{ display: "block" }}>
          {text}
        </span>
      </span>
    </button>
  );
}

export function ActionGrid({ children }: { children: ReactNode }) {
  return <div className="ts-actions">{children}</div>;
}

type AdvancedSectionProps = {
  title?: string;
  hint: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
};

/** O que só quem configura precisa ver fica escondido atrás deste botão. */
export function AdvancedSection({
  title = "Opções avançadas",
  hint,
  children,
  defaultOpen = false,
  onToggle,
}: AdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Stack gap="md">
      <button
        type="button"
        className="ts-advanced-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          onToggle?.(!open);
        }}
      >
        <span>
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        </span>
        <IconChevronDown size={18} stroke={1.6} />
      </button>
      <Collapse expanded={open}>
        <Stack gap="md">{children}</Stack>
      </Collapse>
    </Stack>
  );
}
