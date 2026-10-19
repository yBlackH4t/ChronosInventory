import { baseUrl } from "./apiClient";
import { isMockEnabled, parseResponse } from "./assistantApi";
import type { RobotState } from "./dashboardBento";

// Rotas novas do Painel (2.6.1). Ficam aqui para não mexer nos clientes das outras telas.

export type StockCountPoint = { date: string; com_saldo: number; zerados: number };

export type AssistantPanel = {
  perguntas_hoje: number;
  para_revisar: number;
  rascunhos: number;
  whatsapp_estado: RobotState;
  whatsapp_ativo: boolean;
};

/** Produtos com saldo e zerados no fim de cada dia (linhas dos números do topo). */
export async function getStockCountHistory(
  params: { days: number; scope: number | null },
  signal?: AbortSignal,
): Promise<StockCountPoint[]> {
  const query = new URLSearchParams({ days: String(params.days) });
  if (params.scope !== null) query.set("location_id", String(params.scope));
  const response = await fetch(`${baseUrl}/analytics/stock/count-history?${query}`, { signal });
  return parseResponse<StockCountPoint[]>(response);
}

/** Só contagens do assistente, sem login. Backend antigo (sem a rota) = bloco escondido. */
export async function getAssistantPanel(signal?: AbortSignal): Promise<AssistantPanel> {
  if (isMockEnabled()) {
    return { perguntas_hoje: 7, para_revisar: 3, rascunhos: 1, whatsapp_estado: "conectado", whatsapp_ativo: true };
  }
  const response = await fetch(`${baseUrl}/assistente/painel`, { signal });
  return parseResponse<AssistantPanel>(response);
}
