import { ActionIcon, Badge, Group, Text, Tooltip } from "@mantine/core";
import { IconArrowBackUp, IconArrowRight, IconHistory } from "@tabler/icons-react";
import dayjs from "dayjs";

import type { MovementOut } from "../../lib/api";
import { detectCondition } from "../../lib/brands";
import {
  adjustmentReasonLabel,
  dayHeading,
  groupByDay,
  movementNatureLabel,
  signedQuantity,
} from "../../lib/movements";
import { VERSION_COLORS, movementTone } from "../../lib/semantic";

const TYPE_LABELS: Record<MovementOut["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

type Props = {
  rows: MovementOut[];
  locationName: (id?: number | null) => string | null;
  openHistory: (productId: number) => void;
  onEstorno: (movement: MovementOut) => void;
};

// Movimentações em blocos por dia: faixa da cor do movimento, quantidade grande com
// sinal e chips para tipo, versão, documento e natureza.
export default function MovementsDayList({ rows, locationName, openHistory, onEstorno }: Props) {
  return (
    <div>
      {groupByDay(rows).map((group) => (
        <section key={group.day} aria-label={dayHeading(group.day)}>
          <div className="day-heading">{dayHeading(group.day)}</div>
          {group.rows.map((mov) => {
            const tone = movementTone(mov.tipo, mov.natureza);
            const nome = mov.produto_nome || `ID ${mov.produto_id}`;
            const condition = mov.produto_nome ? detectCondition(mov.produto_nome) : null;
            const origem = locationName(mov.origem_location_id);
            const destino = locationName(mov.destino_location_id);
            const isEstorno = mov.natureza === "ESTORNO";
            const toneVar = `var(--mantine-color-${tone}-filled)`;
            return (
              <div key={mov.id} className="mv-card">
                <span className="mv-card-bar" style={{ background: toneVar }} />
                <div className="mv-card-body">
                  <Text size="sm" fw={600} truncate="end" title={nome}>
                    {nome}
                  </Text>
                  <Group gap={6} mt={4} wrap="wrap">
                    <Badge size="xs" color={tone} variant="light">
                      {mov.natureza === "TRANSFERENCIA_EXTERNA"
                        ? `${TYPE_LABELS[mov.tipo]} · transf. externa`
                        : TYPE_LABELS[mov.tipo]}
                    </Badge>
                    {condition ? (
                      <Badge size="xs" color={VERSION_COLORS[condition.label]} variant="outline">
                        {condition.label}
                      </Badge>
                    ) : null}
                    {mov.documento && mov.documento !== "CADASTRO_INICIAL" ? (
                      <Badge size="xs" color="gray" variant="light" tt="none">
                        {mov.documento}
                      </Badge>
                    ) : null}
                    <Text size="xs" c="dimmed" className="num">
                      {[
                        mov.natureza !== "OPERACAO_NORMAL" && mov.natureza !== "TRANSFERENCIA_EXTERNA"
                          ? movementNatureLabel(mov.natureza)
                          : null,
                        mov.motivo_ajuste ? adjustmentReasonLabel(mov.motivo_ajuste) : null,
                        mov.local_externo || null,
                        dayjs(mov.data).format("HH:mm"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {origem && destino ? (
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" c="dimmed">
                          {origem}
                        </Text>
                        <IconArrowRight size={11} stroke={1.5} color="var(--text-subtle)" />
                        <Text size="xs" c="dimmed">
                          {destino}
                        </Text>
                      </Group>
                    ) : origem || destino ? (
                      <Text size="xs" c="dimmed">
                        {origem ? `de ${origem}` : `para ${destino}`}
                      </Text>
                    ) : null}
                  </Group>
                  {mov.observacao ? (
                    <Text size="xs" c="dimmed" truncate="end" mt={2} title={String(mov.observacao)}>
                      {String(mov.observacao)}
                    </Text>
                  ) : null}
                </div>
                <Text className="mv-card-qty" style={{ color: toneVar }}>
                  {signedQuantity(mov.tipo, mov.quantidade)}
                </Text>
                <Group gap={2} wrap="nowrap" className="row-actions">
                  <Tooltip label="Histórico do produto">
                    <ActionIcon color="gray" aria-label="Histórico do produto" onClick={() => openHistory(mov.produto_id)}>
                      <IconHistory size={16} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={isEstorno ? "Já é um estorno" : "Estornar movimentação"}>
                    <ActionIcon
                      color="gray"
                      className="action-danger"
                      aria-label="Estornar movimentação"
                      onClick={() => onEstorno(mov)}
                      disabled={isEstorno}
                    >
                      <IconArrowBackUp size={16} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
