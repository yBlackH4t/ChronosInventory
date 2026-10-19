import { Button, Group, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import AnimatedNumber from "../../ui/AnimatedNumber";
import BentoCard from "./BentoCard";
import type { AssistantPanel } from "../../../lib/dashboardApi";
import { robotStatus } from "../../../lib/dashboardBento";

type AssistantBlockProps = {
  data: AssistantPanel;
  onOpenAssistant: () => void;
};

// Assistente e WhatsApp: só números (o conteúdo das conversas fica com o admin).
export default function AssistantBlock({ data, onOpenAssistant }: AssistantBlockProps) {
  const robot = robotStatus(data.whatsapp_estado, data.whatsapp_ativo);
  const stats = [
    { label: "perguntas hoje", value: data.perguntas_hoje },
    { label: "respostas para revisar", value: data.rascunhos },
    { label: "códigos para revisar", value: data.para_revisar },
  ];
  const variant = robot.tone === "success" ? undefined : robot.tone;

  return (
    <BentoCard
      area="assist"
      title="Assistente e WhatsApp"
      actions={
        <Button
          size="compact-sm"
          variant="subtle"
          rightSection={<IconArrowRight size={14} stroke={1.8} />}
          onClick={onOpenAssistant}
        >
          Abrir
        </Button>
      }
    >
      <div className="bento-assist-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="bento-assist-stat">
            <div className="bento-assist-stat-value num">
              <AnimatedNumber value={stat.value} />
            </div>
            <div className="bento-assist-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>
      <Group gap={10} mt={12} wrap="nowrap">
        <span
          className="status-dot"
          data-variant={variant}
          data-pulse={robot.pulse || undefined}
          aria-hidden
        />
        <Text size="sm" c="var(--text)">
          {robot.label}
        </Text>
      </Group>
    </BentoCard>
  );
}
