import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowBackUp, IconHistory } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useMemo, useRef } from "react";

import type { MovementOut } from "../../lib/api";
import { detectBrand, detectCondition } from "../../lib/brands";
import {
  adjustmentReasonLabel,
  dayHeading,
  groupByDay,
  movementNatureLabel,
  signedQuantity,
} from "../../lib/movements";
import { movementNote, movementPlace, reversedMovementIds } from "../../lib/movementTimeline";
import { splitProductCode, versionTitle } from "../../lib/productView";
import { movementTone } from "../../lib/semantic";
import { useFlipList } from "../../hooks/useFlipList";
import "../../styles/products-movements.css";

const TYPE_LABELS: Record<MovementOut["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

// Texto da quantidade na cor do movimento (tons escuros o bastante para ler, nos dois temas).
const TONE_TEXT: Record<string, string> = {
  success: "var(--success)",
  orange: "var(--warning)",
  info: "var(--pm-transfer-text)",
  gray: "var(--text-muted)",
};

type Props = {
  rows: MovementOut[];
  locationName: (id?: number | null) => string | null;
  openHistory: (productId: number) => void;
  onEstorno: (movement: MovementOut) => void;
};

// Linha do tempo compacta: uma linha por movimento (hora, produto, selos, local, quantidade
// e ações), agrupada por dia. Movimento novo entra deslizando no topo; o que foi estornado
// aparece riscado.
export default function MovementsDayList({ rows, locationName, openHistory, onEstorno }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const reversed = useMemo(() => reversedMovementIds(rows), [rows]);
  const signature = useMemo(() => rows.map((row) => row.id).join(","), [rows]);
  useFlipList(listRef, signature, { enterOffset: 14 });

  return (
    <div ref={listRef}>
      {groupByDay(rows).map((group) => (
        <section key={group.day} aria-label={dayHeading(group.day)} data-flip-key={`dia-${group.day}`}>
          <div className="day-heading">{dayHeading(group.day)}</div>
          <div className="mv-day" role="list">
            {group.rows.map((mov) => {
              const tone = movementTone(mov.tipo, mov.natureza);
              const nome = mov.produto_nome || `Produto #${mov.produto_id}`;
              const brand = mov.produto_nome ? detectBrand(mov.produto_nome) : null;
              const condition = mov.produto_nome ? detectCondition(mov.produto_nome) : null;
              const { code, rest } = mov.produto_nome
                ? splitProductCode(mov.produto_nome, brand)
                : { code: null, rest: nome };
              const note = movementNote(mov);
              const place = movementPlace(
                locationName(mov.origem_location_id),
                locationName(mov.destino_location_id),
              );
              const isEstorno = mov.natureza === "ESTORNO";
              const isReversed = reversed.has(mov.id);
              const nature =
                mov.natureza !== "OPERACAO_NORMAL" && !isEstorno
                  ? movementNatureLabel(mov.natureza)
                  : null;
              const time = dayjs(mov.data).format("HH:mm");
              const estornoLabel = isEstorno
                ? "Já é um estorno"
                : isReversed
                  ? "Já foi estornada"
                  : "Estornar movimentação";
              return (
                <div
                  key={mov.id}
                  className="mv-line"
                  role="listitem"
                  data-flip-key={mov.id}
                  data-reversed={isReversed || undefined}
                  aria-label={isReversed ? `${nome}, estornada` : undefined}
                >
                  <span className="mv-line-bar" style={{ background: `var(--mantine-color-${tone}-filled)` }} />
                  <span className="mv-line-time" title={dayjs(mov.data).format("DD/MM/YYYY HH:mm")}>
                    {time}
                  </span>
                  <div className="mv-line-product" title={nome}>
                    {condition && (
                      <span
                        className="pm-version-dot"
                        style={{ background: `var(--mantine-color-${condition.color}-filled)` }}
                        title={versionTitle(condition)}
                        aria-label={`Versão ${versionTitle(condition)}`}
                        role="img"
                      />
                    )}
                    {code && (
                      <span className="pm-code" data-size="sm">
                        {code}
                      </span>
                    )}
                    <span className="mv-line-name">{code ? rest : nome}</span>
                  </div>
                  <div className="mv-line-tags">
                    <span className="mv-type" data-tone={tone}>
                      {isEstorno ? "Estorno" : TYPE_LABELS[mov.tipo]}
                    </span>
                    {isEstorno && mov.movimento_ref_id ? (
                      <span className="mv-chip">de #{mov.movimento_ref_id}</span>
                    ) : null}
                    {isReversed ? <span className="mv-chip">Estornada</span> : null}
                    {mov.natureza === "TRANSFERENCIA_EXTERNA" && mov.local_externo ? (
                      <span className="mv-chip">{mov.local_externo}</span>
                    ) : nature ? (
                      <span className="mv-chip">{nature}</span>
                    ) : null}
                    {mov.motivo_ajuste ? (
                      <span className="mv-chip">{adjustmentReasonLabel(mov.motivo_ajuste)}</span>
                    ) : null}
                    {note.tag ? (
                      <span className="mv-chip" data-kind="cadastro">
                        {note.tag}
                      </span>
                    ) : null}
                    {note.document ? <span className="mv-chip">{note.document}</span> : null}
                    {place ? <span className="mv-line-place-inline">{place}</span> : null}
                    {note.observation ? (
                      <span className="mv-line-obs" title={note.observation}>
                        {note.observation}
                      </span>
                    ) : null}
                  </div>
                  <span className="mv-line-place" title={place ?? undefined}>
                    {place ?? "—"}
                  </span>
                  <span className="mv-line-qty" style={{ color: TONE_TEXT[tone] }}>
                    {signedQuantity(mov.tipo, mov.quantidade)}
                  </span>
                  <div className="pm-actions" style={{ display: "flex", gap: 2 }}>
                    <Tooltip label="Histórico do produto">
                      <ActionIcon size={30} aria-label={`Histórico de ${nome}`} onClick={() => openHistory(mov.produto_id)}>
                        <IconHistory size={17} stroke={1.6} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={estornoLabel}>
                      <ActionIcon
                        size={30}
                        className="action-danger"
                        aria-label={estornoLabel}
                        onClick={() => onEstorno(mov)}
                        disabled={isEstorno || isReversed}
                      >
                        <IconArrowBackUp size={17} stroke={1.6} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
