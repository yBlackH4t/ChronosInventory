import { Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../../lib/apiClient";

const SLOW_MS = 1500;

type Ping = { ms: number };

// Ponto do serviço local no topo: verde e pulsando quando responde, âmbar quando demora,
// vermelho quando caiu. A dica diz desde quando.
export default function ApiStatusDot({ version }: { version: string }) {
  const query = useQuery<Ping>({
    queryKey: ["api-ping"],
    queryFn: async ({ signal }) => {
      const started = performance.now();
      await api.health({ signal });
      return { ms: Math.round(performance.now() - started) };
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 10_000,
  });

  const down = query.isError;
  const slow = !down && (query.data?.ms ?? 0) > SLOW_MS;
  // Desde a última resposta boa (ou, sem nenhuma, desde o primeiro erro).
  const downSince = query.dataUpdatedAt || query.errorUpdatedAt;

  const tone = down ? "danger" : slow ? "warning" : undefined;
  const label = down
    ? `Sem resposta do serviço local desde ${dayjs(downSince).format("HH:mm")}. Feche e abra o Chronos se não voltar.`
    : slow
      ? `Serviço local lento (${query.data?.ms} ms) · v${version}`
      : `API conectada${query.data ? ` · ${query.data.ms} ms` : ""} · v${version}`;

  return (
    <Tooltip label={label} multiline w={down ? 260 : undefined}>
      <span className="status-dot-wrap" aria-label={label} role="status">
        <span className="status-dot" data-variant={tone} data-pulse />
      </span>
    </Tooltip>
  );
}
