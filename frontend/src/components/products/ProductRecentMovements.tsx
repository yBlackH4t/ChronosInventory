import { Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import type { MovementOut, SuccessResponse } from "../../lib/api";
import { api } from "../../lib/apiClient";
import { movementNatureLabel, signedQuantity } from "../../lib/movements";
import { movementNote, movementPlace } from "../../lib/movementTimeline";
import { movementTone } from "../../lib/semantic";
import { useLocations } from "../../hooks/useLocations";
import { useProfileScope } from "../../state/profileScope";

const TYPE_LABELS: Record<MovementOut["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

const TONE_TEXT: Record<string, string> = {
  success: "var(--success)",
  orange: "var(--warning)",
  info: "var(--pm-transfer-text)",
  gray: "var(--text-muted)",
};

// As últimas 5 movimentações do produto, direto na ficha (sem abrir a aba Histórico).
export default function ProductRecentMovements({
  productId,
  onSeeAll,
}: {
  productId: number;
  onSeeAll: () => void;
}) {
  const { profileScopeKey } = useProfileScope();
  const { locations } = useLocations();
  // Começa com "historico" + produto: a movimentação rápida já invalida esta chave.
  const query = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["historico", profileScopeKey, productId, "ultimas"],
    queryFn: ({ signal }) =>
      api.getProductHistory(productId, { page: 1, page_size: 5, sort: "-data" }, { signal }),
    staleTime: 30_000,
  });
  const rows = query.data?.data ?? [];
  const total = query.data?.meta?.total_items ?? rows.length;
  const name = (id?: number | null) => {
    if (!id) return null;
    const loc = locations.find((item) => item.id === id);
    return loc ? loc.label || loc.name : `#${id}`;
  };

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
          Últimas movimentações
        </Text>
        {total > rows.length && (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconHistory size={14} stroke={1.5} />}
            onClick={onSeeAll}
          >
            Ver todas ({total})
          </Button>
        )}
      </Group>
      {query.isLoading ? (
        <Skeleton h={120} radius="md" />
      ) : rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nenhuma movimentação ainda.
        </Text>
      ) : (
        <div className="pm-recent" role="list" aria-label="Últimas movimentações">
          {rows.map((mov) => {
            const tone = movementTone(mov.tipo, mov.natureza);
            const note = movementNote(mov);
            const extra = [
              mov.natureza !== "OPERACAO_NORMAL" && mov.natureza !== "ESTORNO"
                ? movementNatureLabel(mov.natureza)
                : null,
              note.tag,
              note.document,
              note.observation,
            ]
              .filter(Boolean)
              .join(" · ");
            const place = movementPlace(name(mov.origem_location_id), name(mov.destino_location_id));
            return (
              <div key={mov.id} className="pm-recent-row" role="listitem">
                <span className="num" style={{ color: "var(--text-muted)" }}>
                  {dayjs(mov.data).format("DD/MM HH:mm")}
                </span>
                <span className="mv-type" data-tone={tone}>
                  {mov.natureza === "ESTORNO" ? "Estorno" : TYPE_LABELS[mov.tipo]}
                </span>
                <span className="num" style={{ fontWeight: 700, textAlign: "right", color: TONE_TEXT[tone] }}>
                  {signedQuantity(mov.tipo, mov.quantidade)}
                </span>
                <span
                  style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-muted)" }}
                  title={[place, extra].filter(Boolean).join(" · ")}
                >
                  {[place, extra].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Stack>
  );
}
