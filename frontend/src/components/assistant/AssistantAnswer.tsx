import { Fragment, type ReactNode } from "react";
import { Alert, Badge, Button, Group, Text } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import {
  IconCamera,
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";

import { splitAnswerBlocks, type AnswerSegment } from "../../lib/assistantAnswer";
import { REVEAL_STEP } from "../../lib/reveal";
import { useProductsVisual } from "../../hooks/useProductsVisual";
import type { AssistantProduct, AssistantResponseMode } from "../../types/assistant";
import Reveal from "../ui/Reveal";
import AssistantProductCard from "./AssistantProductCard";

export type AssistantAnswerMessage = {
  texto: string;
  produtos?: AssistantProduct[];
  modo?: AssistantResponseMode;
  aviso?: string | null;
  leitura_foto?: string | null;
  ensinar?: { codigo_a: string; codigo_b: string; pesquisar?: boolean } | null;
};

const TEACH_OPTIONS = [
  { word: "igual", label: "Igual" },
  { word: "similar", label: "Similar" },
  { word: "diferente", label: "Diferente" },
];

// Blocos da resposta entram um depois do outro (150 ms cada), sem passar de ~1,5 s.
const ANSWER_MAX_STEPS = 10;

function CopyAnswerButton({ text }: { text: string }) {
  const clipboard = useClipboard({ timeout: 1600 });
  return (
    <Button
      size="compact-xs"
      variant="subtle"
      color={clipboard.copied ? "success" : "gray"}
      leftSection={clipboard.copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
      onClick={() => clipboard.copy(text)}
    >
      {clipboard.copied ? "Copiado" : "Copiar resposta"}
    </Button>
  );
}

function Segment({ segment }: { segment: AnswerSegment }) {
  if (segment.code) {
    return (
      <span className="part-code" data-bold={segment.bold || undefined}>
        {segment.text}
      </span>
    );
  }
  return segment.bold ? <strong>{segment.text}</strong> : <>{segment.text}</>;
}

type AssistantAnswerProps = {
  message: AssistantAnswerMessage;
  /** Só a última resposta mostra Igual / Similar / Diferente. */
  isLast: boolean;
  busy: boolean;
  onTeach: (word: string) => void;
  onOpenSettings: () => void;
};

// Cartão da resposta do assistente: cada linha é um bloco que entra em sequência, os
// códigos de peça viram etiquetas e os botões (ensinar, configurações, copiar) e os
// cartões de produto vêm logo depois.
export default function AssistantAnswer({ message, isLast, busy, onTeach, onOpenSettings }: AssistantAnswerProps) {
  const blocks = splitAnswerBlocks(message.texto);
  const produtos = message.produtos ?? [];
  const visual = useProductsVisual(produtos.map((p) => p.id));

  let order = 0;
  const next = () => order++;
  const reveal = (key: string, children: ReactNode, className?: string) => (
    <Reveal key={key} index={next()} step={REVEAL_STEP} maxSteps={ANSWER_MAX_STEPS} className={className}>
      {children}
    </Reveal>
  );

  return (
    <div className="chat-answer">
      <div className="chat-answer-card">
        {message.leitura_foto &&
          reveal(
            "foto",
            <Group gap={6}>
              <IconCamera size={13} aria-hidden />
              <Text size="xs" c="dimmed" fw={500}>
                {message.leitura_foto}
              </Text>
            </Group>,
            "chat-answer-photo",
          )}
        {blocks.map((block, i) =>
          reveal(
            `l${i}`,
            <Text size="sm" component="p" className="chat-answer-line">
              {block.segments.map((segment, j) => (
                <Fragment key={j}>
                  <Segment segment={segment} />
                </Fragment>
              ))}
            </Text>,
            block.gapBefore ? "chat-answer-block chat-answer-gap" : "chat-answer-block",
          ),
        )}

        {isLast &&
          message.ensinar &&
          reveal(
            "ensinar",
            <Group gap={6} className="chat-answer-actions">
              <Text size="xs" c="dimmed" mr={2}>
                Ensinar:
              </Text>
              {TEACH_OPTIONS.map((option) => (
                <Button
                  key={option.word}
                  size="compact-xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => onTeach(option.word)}
                >
                  {option.label}
                </Button>
              ))}
              {message.ensinar.pesquisar && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<IconSearch size={12} />}
                  disabled={busy}
                  onClick={() => onTeach("pesquisar")}
                >
                  Pesquisar na internet
                </Button>
              )}
            </Group>,
          )}

        {message.aviso &&
          reveal(
            "aviso",
            <div className="chat-answer-notice">
              <Badge
                size="xs"
                variant="light"
                color="gray"
                leftSection={<IconSearch size={10} />}
                title="Esta resposta veio da busca direta no estoque, sem IA."
                mb={6}
              >
                Busca direta (sem IA)
              </Badge>
              <Alert variant="light" color="info" p="xs" radius="md" icon={<IconInfoCircle size={16} />}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="xs">{message.aviso}</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconSettings size={12} />}
                    onClick={onOpenSettings}
                  >
                    Configurações
                  </Button>
                </Group>
              </Alert>
            </div>,
          )}

        {message.texto &&
          reveal(
            "copiar",
            <Group gap={4} className="chat-answer-footer">
              <CopyAnswerButton text={message.texto} />
            </Group>,
          )}
      </div>

      {produtos.map((product) =>
        reveal(`p${product.id}`, <AssistantProductCard product={product} visual={visual.get(product.id)} />),
      )}
    </div>
  );
}
